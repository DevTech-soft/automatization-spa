import { businessRepository } from "../repositories/business.repository.js";
import { resolveWhatsAppProviderForBusiness } from "./whatsapp-provider-resolver.js";
import { serviceRepository } from "../repositories/service.repository.js";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { getAvailability } from "./availability.service.js";
import { createAppointment } from "./appointment.service.js";
import { createPayment } from "./payment.service.js";
import { notifyAppointmentConfirmed } from "./notification.service.js";
import { readAgentPaymentOptions } from "./business-settings.js";
import { AvailabilityError, NotFoundError, ValidationError } from "../errors/index.js";
import { assertBusinessOperational } from "./business-guard.js";
import { businessToday, dateOnlyFromUTCDate, dateOnlyToUTCDate, formatTime12h, formatDateLong } from "../utils/datetime.js";
import { normalizePhone } from "../utils/phone.js";
import { logger } from "../utils/logger.js";
import { PENDING_EXPIRATION_MINUTES } from "../config/constants.js";
import { formatMoney } from "../utils/money.js";

/**
 * Capa que expone la lógica de reservas como herramientas del agente
 * conversacional de n8n (ver docs/AGENTE-N8N.md).
 *
 * No reimplementa reglas de negocio: llama a los mismos servicios que usan el
 * formulario web y el bot de menús, para que la disponibilidad, el bloqueo de
 * concurrencia y el hold de pago sigan viviendo en un solo lugar. Lo que sí
 * hace es aplanar las respuestas — un modelo de lenguaje trabaja mucho mejor
 * con `{ hora: "10:00" }` que con un slot anidado de tres niveles.
 *
 * Las horas salen en formato 12 horas ("2:30 p. m.") porque el agente las copia
 * tal cual en el mensaje a la clienta; `crear_reserva` las acepta de vuelta en
 * ese formato (agent.validator).
 */

async function requireBusiness(businessId: string) {
  const business = await businessRepository.findById(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }
  // F1 (§5): las herramientas del agente quedan "off" para negocios no operativos
  // (SUSPENDED → 403, CANCELLED → 404). El bot de menús ya corta antes de
  // reenviar a n8n; esto cubre una llamada directa de n8n.
  assertBusinessOperational(business);
  return business;
}

export interface AgentServiceItem {
  servicioId: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  duracionMinutos: number;
}

export async function listAgentServices(businessId: string): Promise<AgentServiceItem[]> {
  await requireBusiness(businessId);
  const services = await serviceRepository.findActiveByBusinessId(businessId);

  return services.map((service) => ({
    servicioId: service.id,
    nombre: service.name,
    descripcion: service.description,
    precio: Number(service.price),
    duracionMinutos: service.durationMinutes,
  }));
}

export interface AgentAvailabilityResult {
  fecha: string;
  hayCupo: boolean;
  horasLibres: string[];
}

/**
 * Solo las horas libres, como lista de strings. El endpoint público devuelve
 * todos los slots con `available: true|false` porque el formulario web los
 * pinta deshabilitados; al agente esos slots ocupados solo le gastan contexto
 * y lo tientan a ofrecerlos.
 */
export async function getAgentAvailability(
  businessId: string,
  serviceId: string,
  date: string,
): Promise<AgentAvailabilityResult> {
  const result = await getAvailability({ businessId, serviceId, date });
  const horasLibres = result.slots
    .filter((slot) => slot.available)
    .map((slot) => formatTime12h(slot.startTime));

  return { fecha: date, hayCupo: horasLibres.length > 0, horasLibres };
}

/**
 * Cómo eligió pagar quien reserva (el agente se lo pregunta tras el resumen):
 * - "total": link por el 100%.
 * - "abono": link por el % de abono del negocio; el resto se paga en el local.
 * - "local": paga todo en el local; la cita queda confirmada sin link.
 * Sin valor se usa el `chargeMode` del negocio, como antes de existir la opción.
 */
export type AgentPaymentMode = "total" | "abono" | "local";

export interface CreateAgentAppointmentInput {
  businessId: string;
  serviceId: string;
  date: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
  notes?: string | undefined;
  paymentMode?: AgentPaymentMode | undefined;
}

interface CreatedAppointmentBase {
  creada: true;
  codigo: string;
  servicio: string;
  fecha: string;
  inicio: string;
  fin: string;
  precio: number;
  /**
   * Confirmación lista para enviar tal cual. La arma el backend porque es el
   * mensaje que no puede salir mal (código, link, cuánto falta por pagar) y el
   * modelo, al redactarlo él, llegó a mandar su razonamiento o una frase sin
   * sentido justo en este paso.
   */
  mensajeParaCliente: string;
}

function appointmentLines(base: Omit<CreatedAppointmentBase, "mensajeParaCliente">): string {
  return (
    `- Servicio: *${base.servicio}*\n` +
    `- Fecha: ${formatDateLong(base.fecha)}\n` +
    `- Hora: ${base.inicio}\n` +
    `- Código: *${base.codigo}*`
  );
}

export type CreateAgentAppointmentResult =
  | (CreatedAppointmentBase & {
      /** "total" = el link cobra el 100%; "abono" = cobra una parte, el resto es presencial. */
      modoCobro: "total" | "abono";
      /** Monto que cobra el link de pago (el total, o el abono). */
      montoLink: number;
      /** Saldo a pagar en el local. `null` cuando modoCobro = "total". */
      saldoPendiente: number | null;
      linkPago: string;
      minutosParaPagar: number;
    })
  | (CreatedAppointmentBase & {
      /** Paga todo en el local: la cita ya quedó confirmada, no hay link. */
      modoCobro: "en_local";
      saldoPendiente: number;
    })
  | { creada: false; motivo: string };

/**
 * Crea la reserva y, salvo que pague en el local, su link de pago en una sola
 * herramienta. Son dos pasos (`createAppointment` + `createPayment`) que el
 * agente no debería poder dejar a medias: una cita creada sin link de pago
 * expira sola en PENDING_EXPIRATION_MINUTES y la clienta nunca se entera.
 *
 * Los rechazos esperables (slot ocupado, fecha pasada, fuera de horario, una
 * forma de pago que el negocio no ofrece) se devuelven como `creada: false`
 * con un motivo en español en vez de un error HTTP, para que el agente lo lea
 * y ofrezca otra opción en la misma respuesta en lugar de disculparse por una
 * falla técnica.
 */
export async function createAgentAppointment(
  input: CreateAgentAppointmentInput,
): Promise<CreateAgentAppointmentResult> {
  const business = await requireBusiness(input.businessId);
  const options = readAgentPaymentOptions(business);

  // Se valida antes de crear la cita: un rechazo aquí no debe dejar una cita
  // pendiente ocupando el cupo.
  if (input.paymentMode === "local" && !options.payAtVenue) {
    return { creada: false, motivo: "Este negocio no recibe el pago en el local: el pago es por link." };
  }
  if (input.paymentMode === "abono" && options.depositPercentage == null) {
    return { creada: false, motivo: "Este negocio no cobra abono: el link es por el valor total." };
  }

  try {
    const appointment = await createAppointment({
      businessId: input.businessId,
      serviceId: input.serviceId,
      date: input.date,
      startTime: input.startTime,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      notes: input.notes,
      source: "WHATSAPP",
      payAtVenue: input.paymentMode === "local",
    });

    const base = {
      creada: true as const,
      codigo: appointment.appointmentCode,
      servicio: appointment.service.name,
      fecha: dateOnlyFromUTCDate(appointment.appointmentDate),
      inicio: formatTime12h(appointment.startTime),
      fin: formatTime12h(appointment.endTime),
      precio: Number(appointment.price),
    };
    const currency = business.currency;

    if (input.paymentMode === "local") {
      // Ya confirmada: al negocio le llega el aviso de nueva reserva. A quien
      // reservó no, porque el agente se lo está confirmando en esta respuesta.
      void notifyAppointmentConfirmed(appointment.id, { notifyCustomer: false }).catch((error) => {
        logger.error({ error, appointmentId: appointment.id }, "agent_pay_at_venue_notification_failed");
      });
      const mensajeParaCliente =
        `Listo, tu cita quedó confirmada.\n\n${appointmentLines(base)}\n\n` +
        `Pagas ${formatMoney(base.precio, currency)} en el local el día de la cita.`;
      return { ...base, mensajeParaCliente, modoCobro: "en_local", saldoPendiente: base.precio };
    }

    const payment = await createPayment({
      entityType: "APPOINTMENT",
      entityId: appointment.id,
      chargeMode: input.paymentMode === "abono" ? "DEPOSIT" : input.paymentMode === "total" ? "TOTAL" : undefined,
    });

    const isDeposit = payment.chargeMode === "DEPOSIT";
    const mensajeParaCliente =
      `Listo, tu cita quedó apartada.\n\n${appointmentLines(base)}\n\n` +
      (isDeposit
        ? `Para confirmarla, paga el abono de ${formatMoney(payment.amount, currency)} aquí:\n${payment.paymentUrl}\n\n` +
          `El saldo de ${formatMoney(payment.pendingBalance ?? 0, currency)} lo pagas en el local el día de la cita. `
        : `Para confirmarla, paga ${formatMoney(payment.amount, currency)} aquí:\n${payment.paymentUrl}\n\n`) +
      `El cupo queda apartado por ${PENDING_EXPIRATION_MINUTES} minutos.`;

    return {
      ...base,
      mensajeParaCliente,
      modoCobro: isDeposit ? "abono" : "total",
      montoLink: payment.amount,
      saldoPendiente: payment.pendingBalance,
      linkPago: payment.paymentUrl,
      minutosParaPagar: PENDING_EXPIRATION_MINUTES,
    };
  } catch (error) {
    if (error instanceof AvailabilityError || error instanceof ValidationError) {
      return { creada: false, motivo: error.message };
    }
    logger.error({ error, businessId: input.businessId }, "agent_create_appointment_failed");
    throw error;
  }
}

export interface AgentAppointmentItem {
  codigo: string;
  servicio: string;
  fecha: string;
  inicio: string;
  fin: string;
  estado: string;
  estadoPago: string;
  precio: number;
}

export async function listAgentAppointments(
  businessId: string,
  phone: string,
): Promise<AgentAppointmentItem[]> {
  const business = await requireBusiness(businessId);
  const fromDate = dateOnlyToUTCDate(businessToday(business.timezone));
  const appointments = await appointmentRepository.findActiveByPhone(
    businessId,
    normalizePhone(phone),
    fromDate,
  );

  return appointments.map((appointment) => ({
    codigo: appointment.appointmentCode,
    servicio: appointment.service.name,
    fecha: dateOnlyFromUTCDate(appointment.appointmentDate),
    inicio: formatTime12h(appointment.startTime),
    fin: formatTime12h(appointment.endTime),
    estado: appointment.status,
    estadoPago: appointment.paymentStatus,
    precio: Number(appointment.price),
  }));
}

/**
 * Entrega al cliente el texto que redactó el agente.
 *
 * n8n no habla con Meta: la regla de `WhatsAppProvider.ts` es que ningún módulo
 * fuera de la capa de integración lo haga, y respetarla mantiene el token, los
 * reintentos y un eventual cambio de BSP en un solo sitio. n8n redacta, el
 * backend envía.
 */
export async function sendAgentReply(businessId: string, phone: string, text: string): Promise<void> {
  await requireBusiness(businessId);
  const provider = await resolveWhatsAppProviderForBusiness(businessId, "AGENT");
  await provider.sendText(normalizePhone(phone), text);
  logger.info({ businessId, phone }, "agent_reply_sent");
}
