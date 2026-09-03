import { DateTime } from "luxon";
import type { WhatsAppConversation } from "@spa/db";
import { businessRepository } from "../repositories/business.repository.js";
import { whatsAppAccountRepository } from "../repositories/whatsAppAccount.repository.js";
import { isBusinessOperational } from "./business-guard.js";
import { serviceRepository } from "../repositories/service.repository.js";
import { businessHourRepository } from "../repositories/businessHour.repository.js";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { whatsappConversationRepository } from "../repositories/whatsappConversation.repository.js";
import { getWhatsAppProvider } from "../integrations/whatsapp/index.js";
import type { InteractiveListRow, WhatsAppProvider } from "../integrations/whatsapp/index.js";
import { forwardToAgent, isAgentEnabled, readAgentSettings } from "../integrations/n8n/AgentForwarder.js";
import { getAvailability } from "./availability.service.js";
import { createAppointment } from "./appointment.service.js";
import { createPayment } from "./payment.service.js";
import { AvailabilityError, NotFoundError, ValidationError } from "../errors/index.js";
import { businessToday, calendarDayOfWeek, dateOnlyFromUTCDate, dateOnlyToUTCDate } from "../utils/datetime.js";
import { normalizePhone } from "../utils/phone.js";
import { logger } from "../utils/logger.js";

const DATE_OPTIONS_AHEAD_DAYS = 14;
const MAX_LIST_ROWS = 10;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatMoney(amount: number | string, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(
      Number(amount),
    );
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatDateLabel(dateStr: string): string {
  return DateTime.fromISO(dateStr, { zone: "utc" }).setLocale("es").toFormat("EEE d MMM").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Entrada del webhook (sección 17). Determinístico: cada mensaje entrante se
 * resuelve contra el estado actual de la conversación, nunca con un LLM
 * (sección 18).
 */
export async function handleIncomingWhatsAppMessage(rawPayload: unknown): Promise<void> {
  const provider = getWhatsAppProvider();
  const message = provider.parseIncomingMessage(rawPayload);
  if (message.kind === "ignored") {
    return;
  }

  // Resolución de tenant (docs/PANEL-OPERADOR.md §7.2): se prefiere el
  // `phone_number_id` estable de Meta; mientras F4 no puebla `whatsapp_accounts`
  // cae al match por número display.
  const business =
    (message.phoneNumberId
      ? await whatsAppAccountRepository.findBusinessByPhoneNumberId(message.phoneNumberId)
      : null) ?? (await businessRepository.findByWhatsAppNumber(message.to));

  if (!business) {
    logger.warn({ to: message.to, phoneNumberId: message.phoneNumberId }, "whatsapp_message_unknown_business_number");
    return;
  }

  const phone = normalizePhone(message.from);

  // F1 — guard de estado (§5). El canal de WhatsApp no responde con 4xx:
  // `SUSPENDED` → un único mensaje de "servicio inactivo" y nada más;
  // `CANCELLED` / `active=false` → silencio total.
  if (!isBusinessOperational(business)) {
    if (business.status === "SUSPENDED") {
      await provider.sendText(
        phone,
        `El servicio de reservas de ${business.name} está temporalmente inactivo. ` +
          `Por favor comunícate directamente con el negocio${business.phone ? ` (${business.phone})` : ""}.`,
      );
      logger.info({ businessId: business.id }, "whatsapp_message_soft_suspended");
    } else {
      logger.info({ businessId: business.id, status: business.status }, "whatsapp_message_dropped_inactive");
    }
    return;
  }

  logger.info({ businessId: business.id, phone }, "whatsapp_message_received");

  // Negocios migrados al agente conversacional de n8n (settings.agentEnabled):
  // el mensaje se reenvía y este servicio no sigue. Solo se reenvía texto —
  // el agente no envía listas interactivas, así que un interactive_reply aquí
  // viene de una conversación previa del bot de menús y se resuelve abajo.
  // Si n8n no contesta, no se pierde la conversación: cae al bot de menús.
  if (message.kind === "text" && isAgentEnabled(business.settings)) {
    const forwarded = await forwardToAgent({
      businessId: business.id,
      businessName: business.name,
      timezone: business.timezone,
      currency: business.currency,
      phone,
      contactName: message.contactName,
      text: message.text,
      agent: readAgentSettings(business.settings),
    });

    if (forwarded) {
      return;
    }
    logger.warn({ businessId: business.id, phone }, "whatsapp_agent_unavailable_menu_fallback");
  }

  if (message.kind === "text" && /^cancelar$/i.test(message.text.trim())) {
    const existing = await whatsappConversationRepository.findActive(business.id, phone);
    if (existing && existing.state !== "CANCELLED" && existing.state !== "CONFIRMED") {
      await whatsappConversationRepository.reset(existing.id, "CANCELLED");
    }
    await provider.sendText(phone, "Tu reserva fue cancelada. Escribe cualquier mensaje para empezar de nuevo.");
    return;
  }

  let conversation = await whatsappConversationRepository.findActive(business.id, phone);

  if (!conversation) {
    conversation = await whatsappConversationRepository.createInitial(business.id, phone);
    await sendServiceList(provider, business.id, phone);
    return;
  }

  if (conversation.state === "CONFIRMED" || conversation.state === "CANCELLED") {
    conversation = await whatsappConversationRepository.reset(conversation.id);
    await sendServiceList(provider, business.id, phone);
    return;
  }

  switch (conversation.state) {
    case "SELECTING_SERVICE":
      await handleServiceSelection(provider, business.id, phone, conversation, message);
      return;
    case "SELECTING_DATE":
      await handleDateSelection(provider, business.id, phone, conversation, message);
      return;
    case "SELECTING_TIME":
      await handleTimeSelection(provider, business.id, phone, conversation, message);
      return;
    case "COLLECTING_NAME":
      await handleNameCollection(provider, business.id, phone, conversation, message);
      return;
    case "WAITING_PAYMENT":
      await handleWaitingPayment(provider, phone, conversation, message);
      return;
    default:
      // COLLECTING_PHONE nunca queda persistido esperando respuesta (ver schema.prisma).
      logger.error({ state: conversation.state }, "whatsapp_conversation_unexpected_state");
  }
}

type IncomingMessage = Awaited<ReturnType<WhatsAppProvider["parseIncomingMessage"]>>;

// ---------- Paso 1: servicio ----------

async function sendServiceList(provider: WhatsAppProvider, businessId: string, phone: string): Promise<void> {
  const services = await serviceRepository.findActiveByBusinessId(businessId);
  if (services.length === 0) {
    await provider.sendText(phone, "Por ahora no tenemos servicios disponibles. Contáctanos directamente.");
    return;
  }

  const rows: InteractiveListRow[] = services.slice(0, MAX_LIST_ROWS).map((service) => ({
    id: service.id,
    title: truncate(service.name, 24),
    description: truncate(`${service.durationMinutes} min · ${formatMoney(service.price.toString(), "COP")}`, 72),
  }));

  await provider.sendInteractiveMessage(phone, {
    type: "list",
    bodyText: "¡Hola! ¿Qué servicio quieres reservar?",
    buttonText: "Ver servicios",
    sections: [{ rows }],
  });
}

async function handleServiceSelection(
  provider: WhatsAppProvider,
  businessId: string,
  phone: string,
  conversation: WhatsAppConversation,
  message: IncomingMessage,
): Promise<void> {
  if (message.kind !== "interactive_reply") {
    await provider.sendText(phone, "Por favor elige una opción de la lista.");
    await sendServiceList(provider, businessId, phone);
    return;
  }

  const service = await serviceRepository.findActiveById(businessId, message.replyId);
  if (!service) {
    await provider.sendText(phone, "Ese servicio ya no está disponible, elige otro.");
    await sendServiceList(provider, businessId, phone);
    return;
  }

  await whatsappConversationRepository.update(conversation.id, { serviceId: service.id, state: "SELECTING_DATE" });
  await sendDateList(provider, businessId, phone, service.id);
}

// ---------- Paso 2: fecha ----------

async function sendDateList(provider: WhatsAppProvider, businessId: string, phone: string, serviceId: string): Promise<void> {
  const business = await businessRepository.findById(businessId);
  if (!business) return;

  const today = businessToday(business.timezone);
  const rows: InteractiveListRow[] = [];
  for (let offset = 0; offset < DATE_OPTIONS_AHEAD_DAYS && rows.length < MAX_LIST_ROWS; offset++) {
    const dateStr = DateTime.fromISO(today, { zone: "utc" }).plus({ days: offset }).toISODate();
    if (!dateStr) continue;
    const hours = await businessHourRepository.findForDay(businessId, calendarDayOfWeek(dateStr));
    if (hours) {
      rows.push({ id: dateStr, title: formatDateLabel(dateStr) });
    }
  }

  if (rows.length === 0) {
    await provider.sendText(phone, "No encontramos fechas disponibles próximamente. Contáctanos directamente.");
    return;
  }

  await provider.sendInteractiveMessage(phone, {
    type: "list",
    bodyText: "Elige una fecha:",
    buttonText: "Ver fechas",
    sections: [{ rows }],
  });
  void serviceId; // reservado por si se necesita filtrar fechas por servicio en el futuro.
}

async function handleDateSelection(
  provider: WhatsAppProvider,
  businessId: string,
  phone: string,
  conversation: WhatsAppConversation,
  message: IncomingMessage,
): Promise<void> {
  if (message.kind !== "interactive_reply" || !/^\d{4}-\d{2}-\d{2}$/.test(message.replyId)) {
    await provider.sendText(phone, "Por favor elige una fecha de la lista.");
    await sendDateList(provider, businessId, phone, conversation.serviceId ?? "");
    return;
  }
  if (!conversation.serviceId) {
    await whatsappConversationRepository.reset(conversation.id);
    await sendServiceList(provider, businessId, phone);
    return;
  }

  await whatsappConversationRepository.update(conversation.id, {
    date: dateOnlyToUTCDate(message.replyId),
    state: "SELECTING_TIME",
  });
  await sendTimeList(provider, businessId, phone, conversation.id, conversation.serviceId, message.replyId);
}

// ---------- Paso 3: hora ----------

async function sendTimeList(
  provider: WhatsAppProvider,
  businessId: string,
  phone: string,
  conversationId: string,
  serviceId: string,
  date: string,
): Promise<void> {
  let availableSlots;
  try {
    const result = await getAvailability({ businessId, serviceId, date });
    availableSlots = result.slots.filter((slot) => slot.available);
  } catch (error) {
    logger.error({ error, businessId, serviceId, date }, "whatsapp_availability_check_failed");
    await provider.sendText(phone, "No pudimos consultar la disponibilidad. Intenta de nuevo en un momento.");
    return;
  }

  if (availableSlots.length === 0) {
    // El estado debe volver a reflejar que estamos esperando una fecha, no una hora.
    await whatsappConversationRepository.update(conversationId, { state: "SELECTING_DATE" });
    await provider.sendText(phone, "Lo sentimos, no tenemos disponibilidad para ese día. Elige otra fecha.");
    await sendDateList(provider, businessId, phone, serviceId);
    return;
  }

  const rows: InteractiveListRow[] = availableSlots.slice(0, MAX_LIST_ROWS).map((slot) => ({
    id: slot.startTime,
    title: slot.startTime,
  }));

  await provider.sendInteractiveMessage(phone, {
    type: "list",
    bodyText: "Elige un horario:",
    buttonText: "Ver horarios",
    sections: [{ rows }],
  });
}

async function handleTimeSelection(
  provider: WhatsAppProvider,
  businessId: string,
  phone: string,
  conversation: WhatsAppConversation,
  message: IncomingMessage,
): Promise<void> {
  const date = conversation.date ? dateOnlyFromUTCDate(conversation.date) : null;
  if (!conversation.serviceId || !date) {
    await whatsappConversationRepository.reset(conversation.id);
    await sendServiceList(provider, businessId, phone);
    return;
  }

  if (message.kind !== "interactive_reply" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(message.replyId)) {
    await provider.sendText(phone, "Por favor elige un horario de la lista.");
    await sendTimeList(provider, businessId, phone, conversation.id, conversation.serviceId, date);
    return;
  }

  await whatsappConversationRepository.update(conversation.id, {
    startTime: message.replyId,
    state: "COLLECTING_NAME",
  });
  await provider.sendText(phone, "¿Cuál es tu nombre completo?");
}

// ---------- Paso 4: nombre (+ teléfono automático y creación de reserva) ----------

async function handleNameCollection(
  provider: WhatsAppProvider,
  businessId: string,
  phone: string,
  conversation: WhatsAppConversation,
  message: IncomingMessage,
): Promise<void> {
  if (message.kind !== "text" || message.text.trim().length < 2) {
    await provider.sendText(phone, "Escribe tu nombre completo para continuar.");
    return;
  }
  const customerName = message.text.trim();
  const date = conversation.date ? dateOnlyFromUTCDate(conversation.date) : null;

  if (!conversation.serviceId || !date || !conversation.startTime) {
    await whatsappConversationRepository.reset(conversation.id);
    await sendServiceList(provider, businessId, phone);
    return;
  }

  // COLLECTING_PHONE: se resuelve automáticamente con el remitente de WhatsApp,
  // sin turno de conversación adicional (ver comentario en schema.prisma).
  await whatsappConversationRepository.update(conversation.id, { customerName, state: "COLLECTING_PHONE" });

  try {
    const appointment = await createAppointment({
      businessId,
      serviceId: conversation.serviceId,
      date,
      startTime: conversation.startTime,
      customerName,
      customerPhone: phone,
      source: "WHATSAPP",
    });

    const payment = await createPayment({ entityType: "APPOINTMENT", entityId: appointment.id });

    await whatsappConversationRepository.update(conversation.id, {
      state: "WAITING_PAYMENT",
      appointmentId: appointment.id,
    });

    await provider.sendText(
      phone,
      `¡Gracias, ${customerName}! Para confirmar tu reserva de ${appointment.service.name} paga aquí:\n\n` +
        `${payment.paymentUrl}\n\n` +
        `Tu horario queda reservado por 15 minutos mientras completas el pago. Escribe "estado" para consultar en cualquier momento.`,
    );
  } catch (error) {
    if (error instanceof AvailabilityError) {
      await provider.sendText(phone, `${error.message} Elige otro horario.`);
      await whatsappConversationRepository.update(conversation.id, { state: "SELECTING_TIME" });
      await sendTimeList(provider, businessId, phone, conversation.id, conversation.serviceId, date);
      return;
    }
    logger.error({ error, businessId, phone }, "whatsapp_create_appointment_failed");
    await provider.sendText(phone, "No pudimos crear tu reserva. Intenta de nuevo en un momento.");
    await whatsappConversationRepository.reset(conversation.id);
  }
}

// ---------- Paso 5: esperando pago ----------

async function handleWaitingPayment(
  provider: WhatsAppProvider,
  phone: string,
  conversation: WhatsAppConversation,
  message: IncomingMessage,
): Promise<void> {
  if (!conversation.appointmentId) {
    await whatsappConversationRepository.reset(conversation.id);
    await provider.sendText(phone, "Escribe cualquier mensaje para empezar una nueva reserva.");
    return;
  }

  const appointment = await appointmentRepository.findById(conversation.appointmentId);
  if (!appointment) {
    await whatsappConversationRepository.reset(conversation.id);
    await provider.sendText(phone, "No encontramos tu reserva. Escribe cualquier mensaje para empezar de nuevo.");
    return;
  }

  if (appointment.status === "CONFIRMED") {
    await whatsappConversationRepository.update(conversation.id, { state: "CONFIRMED" });
    await provider.sendText(phone, "¡Tu reserva ya está confirmada! Nos vemos pronto. 🎉");
    return;
  }

  if (appointment.status === "EXPIRED" || appointment.status === "CANCELLED") {
    await whatsappConversationRepository.reset(conversation.id);
    await provider.sendText(phone, "Esa reserva ya no está disponible. Escribe cualquier mensaje para empezar de nuevo.");
    return;
  }

  const isStatusQuery = message.kind === "text" && /estado|status/i.test(message.text);
  if (isStatusQuery) {
    await provider.sendText(phone, `Tu reserva ${appointment.appointmentCode} está: ${appointment.status} (pago: ${appointment.paymentStatus}).`);
    return;
  }

  try {
    const payment = await createPayment({ entityType: "APPOINTMENT", entityId: appointment.id });
    await provider.sendText(
      phone,
      `Todavía no hemos recibido tu pago. Puedes completarlo aquí:\n\n${payment.paymentUrl}`,
    );
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      await whatsappConversationRepository.reset(conversation.id);
      await provider.sendText(phone, `${error.message} Escribe cualquier mensaje para empezar de nuevo.`);
      return;
    }
    throw error;
  }
}
