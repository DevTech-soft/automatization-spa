import type { NotificationType } from "@spa/db";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { giftCardRepository } from "../repositories/giftCard.repository.js";
import { notificationLogRepository } from "../repositories/notificationLog.repository.js";
import { resolveWhatsAppProviderForBusiness } from "./whatsapp-provider-resolver.js";
import { forwardToAgent, isAgentEnabled, readAgentSettings, readBusinessVertical } from "../integrations/n8n/AgentForwarder.js";
import { dateOnlyFromUTCDate, formatTime12h } from "../utils/datetime.js";
import { digitsOnly } from "../utils/phone.js";
import { isUniqueConstraintViolation } from "../utils/prisma-errors.js";
import { logger } from "../utils/logger.js";
import { readAgentPaymentOptions } from "./business-settings.js";
import { formatMoney } from "../utils/money.js";

/**
 * Registra la notificación en `notification_log` ANTES de enviarla: si ya
 * existe (P2002), es un reproceso y no se reenvía (sección 21/32 — idempotencia).
 * Devuelve `true` si esta llamada es la que debe enviar el mensaje.
 */
async function claimNotification(
  businessId: string,
  entityType: "APPOINTMENT" | "GIFT_CARD",
  entityId: string,
  type: NotificationType,
): Promise<boolean> {
  try {
    await notificationLogRepository.create({
      businessId,
      entityType,
      entityId,
      type,
      channel: "WHATSAPP",
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * Envía las notificaciones de reserva confirmada (sección 22): al cliente y
 * al negocio, por WhatsApp. Se llama fuera de la transacción del webhook de
 * pago (payment.service.ts) — un fallo de envío nunca debe revertir la
 * confirmación del pago, solo se registra.
 */
export async function notifyAppointmentConfirmed(
  appointmentId: string,
  options: {
    /**
     * `false` cuando quien reservó ya recibió la confirmación por otro lado
     * (el agente se la acaba de escribir al cerrar una cita "paga en el local").
     */
    notifyCustomer?: boolean;
  } = {},
): Promise<void> {
  const appointment = await appointmentRepository.findByIdWithDetails(appointmentId);
  if (!appointment) {
    logger.error({ appointmentId }, "notify_appointment_confirmed_appointment_missing");
    return;
  }

  const { customer, service, business } = appointment;
  const dateLabel = dateOnlyFromUTCDate(appointment.appointmentDate);
  const price = formatMoney(appointment.price.toString(), business.currency);

  // Modo abono (§6.2): la clienta pagó solo una parte online; el saldo es presencial.
  const isDeposit = appointment.depositAmount != null && appointment.pendingBalance != null;
  const depositLine = isDeposit
    ? `\nAbono recibido: ${formatMoney(appointment.depositAmount!.toString(), business.currency)}` +
      `\nSaldo a pagar en el local: ${formatMoney(appointment.pendingBalance!.toString(), business.currency)}`
    : "";

  // Eligió pagar todo en el local: confirmada sin ningún pago online.
  const payAtVenue = appointment.paymentStatus === "PENDING";

  try {
    if (
      options.notifyCustomer !== false &&
      (await claimNotification(business.id, "APPOINTMENT", appointment.id, "APPOINTMENT_CONFIRMATION"))
    ) {
      const provider = await resolveWhatsAppProviderForBusiness(business.id, "NOTIFICATION");
      await provider.sendText(
        customer.phone,
        `¡Hola ${customer.name}! Tu reserva en ${business.name} quedó confirmada ✅\n\n` +
          `${service.name}\n${dateLabel} · ${formatTime12h(appointment.startTime)} - ${formatTime12h(appointment.endTime)}\n${price}${depositLine}\n\n` +
          `Código: ${appointment.appointmentCode}`,
      );
      logger.info({ appointmentId }, "whatsapp_appointment_confirmation_sent");
    }
  } catch (error) {
    logger.error({ appointmentId, error }, "whatsapp_appointment_confirmation_failed");
  }

  if (!business.whatsappNumber) {
    return;
  }

  try {
    if (await claimNotification(business.id, "APPOINTMENT", appointment.id, "BUSINESS_NEW_APPOINTMENT")) {
      const provider = await resolveWhatsAppProviderForBusiness(business.id, "NOTIFICATION");
      await provider.sendText(
        business.whatsappNumber,
        `Nueva reserva confirmada 📅\n\n` +
          `Cliente: ${customer.name} (${customer.phone})\n` +
          `Servicio: ${service.name}\n${dateLabel} · ${formatTime12h(appointment.startTime)} - ${formatTime12h(appointment.endTime)}\n` +
          `Valor: ${price}\n` +
          (isDeposit
            ? `Estado de pago: ABONO PAGADO${depositLine}`
            : payAtVenue
              ? `Estado de pago: PAGA EN EL LOCAL (${price} pendiente)`
              : `Estado de pago: PAID`),
      );
      logger.info({ appointmentId }, "whatsapp_business_notification_sent");
    }
  } catch (error) {
    logger.error({ appointmentId, error }, "whatsapp_business_notification_failed");
  }
}

/**
 * Recordatorio ~24h antes de una cita CONFIRMED (sección 21). Llamado por el
 * scheduler (src/jobs/scheduler.ts, Fase 9) para cada cita candidata; la
 * idempotencia la da `claimNotification` (tipo APPOINTMENT_REMINDER), así que
 * es seguro llamarlo más de una vez para la misma cita.
 */
export async function notifyAppointmentReminder(appointmentId: string): Promise<void> {
  const appointment = await appointmentRepository.findByIdWithDetails(appointmentId);
  if (!appointment) {
    logger.error({ appointmentId }, "notify_appointment_reminder_appointment_missing");
    return;
  }

  const { customer, service, business } = appointment;
  const dateLabel = dateOnlyFromUTCDate(appointment.appointmentDate);

  try {
    if (await claimNotification(business.id, "APPOINTMENT", appointment.id, "APPOINTMENT_REMINDER")) {
      const provider = await resolveWhatsAppProviderForBusiness(business.id, "NOTIFICATION");
      await provider.sendText(
        customer.phone,
        `Hola ${customer.name} ❤️ Te recordamos que el ${dateLabel} tienes tu cita de ${service.name} ` +
          `a las ${formatTime12h(appointment.startTime)} en ${business.name}.`,
      );
      logger.info({ appointmentId }, "whatsapp_appointment_reminder_sent");
    }
  } catch (error) {
    logger.error({ appointmentId, error }, "whatsapp_appointment_reminder_failed");
  }
}

export interface CancellationNotice {
  /**
   * `agent`: se le encargó al bot de n8n. El webhook responde al recibir, así
   * que solo se sabe que lo aceptó, no que el WhatsApp llegó.
   * `direct`: lo envió el backend y `sent` dice si Meta lo aceptó.
   */
  via: "agent" | "direct";
  sent: boolean;
  phone: string;
}

/**
 * Aviso a la clienta de que el negocio le canceló la cita (acción "Cancelar"
 * del panel y del portal). A diferencia de las demás no pasa por
 * `notification_log`: la transición a CANCELLED es atómica y no tiene vuelta
 * atrás, así que no hay reproceso que deduplicar.
 *
 * Si el negocio usa el agente de n8n, el aviso lo redacta y lo envía el bot:
 * queda en su memoria de la conversación y, si la clienta responde "¿y para
 * cuándo hay?", ya sabe de qué cita le hablan. Si n8n no recibe el evento, o
 * el negocio sigue con el bot de menús, lo envía el backend directo.
 *
 * En los dos caminos es texto libre: fuera de la ventana de 24 h de WhatsApp
 * Meta no lo entrega. Nunca lanza: la cita ya quedó cancelada.
 */
export async function notifyAppointmentCancelled(appointmentId: string): Promise<CancellationNotice | null> {
  const appointment = await appointmentRepository.findByIdWithDetails(appointmentId);
  if (!appointment) {
    logger.error({ appointmentId }, "notify_appointment_cancelled_appointment_missing");
    return null;
  }

  const { customer, service, business } = appointment;
  const dateLabel = dateOnlyFromUTCDate(appointment.appointmentDate);
  // Cancelar no reembolsa (eso lo hace el negocio en su Wompi): no se promete
  // devolución, solo que el negocio la contactará.
  const paid = appointment.paymentStatus === "PAID" || appointment.paymentStatus === "DEPOSIT_PAID";

  if (isAgentEnabled(business.settings)) {
    const instruccion =
      `El negocio canceló la cita ${appointment.appointmentCode} de ${service.name} del ${dateLabel} ` +
      `a las ${formatTime12h(appointment.startTime)}. Quien la reservó todavía no lo sabe. Escríbele un mensaje corto avisándole` +
      (paid ? " y dile que el equipo se pondrá en contacto por el pago que hizo (no prometas reembolso)." : ".") +
      " No menciones ni inventes el motivo. Ofrécele agendar otra fecha si quiere.";

    const forwarded = await forwardToAgent({
      businessId: business.id,
      businessName: business.name,
      vertical: readBusinessVertical(business.settings),
      timezone: business.timezone,
      currency: business.currency,
      // Solo dígitos, como el `wa_id` de los mensajes entrantes: la memoria del
      // agente se indexa por `businessId:phone` y un "+" la mandaría a otra
      // conversación.
      phone: digitsOnly(customer.phone),
      contactName: customer.name,
      text: `[Aviso del sistema] ${instruccion}`,
      agent: readAgentSettings(business.settings),
      payments: readAgentPaymentOptions(business),
      event: {
        type: "appointment_cancelled",
        instruccion,
        cita: {
          codigo: appointment.appointmentCode,
          servicio: service.name,
          fecha: dateLabel,
          inicio: formatTime12h(appointment.startTime),
          estadoPago: appointment.paymentStatus,
        },
      },
    });
    if (forwarded) {
      logger.info({ appointmentId }, "appointment_cancellation_forwarded_to_agent");
      return { via: "agent", sent: true, phone: customer.phone };
    }
    logger.warn({ appointmentId }, "appointment_cancellation_agent_unavailable_direct_fallback");
  }

  const paymentLine = paid ? `\n\nSobre el pago que hiciste, ${business.name} se pondrá en contacto contigo.` : "";
  try {
    const provider = await resolveWhatsAppProviderForBusiness(business.id, "NOTIFICATION");
    await provider.sendText(
      customer.phone,
      `Hola ${customer.name}, te escribimos de ${business.name}. ` +
        `Tu cita de ${service.name} del ${dateLabel} a las ${formatTime12h(appointment.startTime)} fue cancelada.` +
        `${paymentLine}\n\nSi quieres agendar otra fecha, escríbenos por aquí.`,
    );
    logger.info({ appointmentId }, "whatsapp_appointment_cancellation_sent");
    return { via: "direct", sent: true, phone: customer.phone };
  } catch (error) {
    logger.warn({ appointmentId, error }, "whatsapp_appointment_cancellation_failed");
    return { via: "direct", sent: false, phone: customer.phone };
  }
}

/**
 * Envía la Gift Card al comprador y notifica al negocio (sección 15, pasos
 * 7-8 y sección 22). `pdfUrl` puede ser `null` si la generación de la imagen
 * falló — en ese caso se envía un texto sin adjunto en vez de bloquear el
 * flujo (el comprador ya pagó, debe enterarse igual).
 */
export async function notifyGiftCardCreated(giftCardId: string, pdfUrl: string | null): Promise<void> {
  const giftCard = await giftCardRepository.findByIdWithDetails(giftCardId);
  if (!giftCard) {
    logger.error({ giftCardId }, "notify_gift_card_created_missing");
    return;
  }

  const { business } = giftCard;
  const serviceName = giftCard.service?.name ?? "";
  const summary =
    `${serviceName}\nPara: ${giftCard.recipientName}\nCódigo: ${giftCard.code}` +
    (giftCard.message ? `\n\n"${giftCard.message}"` : "");

  try {
    if (await claimNotification(business.id, "GIFT_CARD", giftCard.id, "GIFT_CARD_DELIVERY")) {
      const provider = await resolveWhatsAppProviderForBusiness(business.id, "NOTIFICATION");
      if (pdfUrl) {
        await provider.sendDocument(
          giftCard.buyerPhone,
          pdfUrl,
          `¡Gracias por tu compra en ${business.name}! Aquí está tu Gift Card:\n\n${summary}`,
        );
      } else {
        await provider.sendText(
          giftCard.buyerPhone,
          `¡Gracias por tu compra en ${business.name}! Tu Gift Card ya está lista:\n\n${summary}`,
        );
      }
      await giftCardRepository.markSent(giftCard.id);
      logger.info({ giftCardId }, "whatsapp_gift_card_sent");
    }
  } catch (error) {
    logger.error({ giftCardId, error }, "whatsapp_gift_card_send_failed");
  }

  if (!business.whatsappNumber) {
    return;
  }

  try {
    if (await claimNotification(business.id, "GIFT_CARD", giftCard.id, "BUSINESS_NEW_GIFT_CARD")) {
      const provider = await resolveWhatsAppProviderForBusiness(business.id, "NOTIFICATION");
      await provider.sendText(
        business.whatsappNumber,
        `Nueva Gift Card comprada 🎁\n\nComprador: ${giftCard.buyerName} (${giftCard.buyerPhone})\n` +
          `Destinatario: ${giftCard.recipientName}\n${summary}`,
      );
      logger.info({ giftCardId }, "whatsapp_business_gift_card_notification_sent");
    }
  } catch (error) {
    logger.error({ giftCardId, error }, "whatsapp_business_gift_card_notification_failed");
  }
}
