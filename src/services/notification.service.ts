import { appointmentRepository } from "../repositories/appointment.repository.js";
import { notificationLogRepository } from "../repositories/notificationLog.repository.js";
import { getWhatsAppProvider } from "../integrations/whatsapp/index.js";
import { dateOnlyFromUTCDate } from "../utils/datetime.js";
import { isUniqueConstraintViolation } from "../utils/prisma-errors.js";
import { logger } from "../utils/logger.js";

function formatMoney(amount: number | string, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(
      Number(amount),
    );
  } catch {
    return `${amount} ${currency}`;
  }
}

/**
 * Registra la notificación en `notification_log` ANTES de enviarla: si ya
 * existe (P2002), es un reproceso y no se reenvía (sección 21/32 — idempotencia).
 * Devuelve `true` si esta llamada es la que debe enviar el mensaje.
 */
async function claimNotification(
  businessId: string,
  entityId: string,
  type: "APPOINTMENT_CONFIRMATION" | "BUSINESS_NEW_APPOINTMENT",
): Promise<boolean> {
  try {
    await notificationLogRepository.create({
      businessId,
      entityType: "APPOINTMENT",
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
export async function notifyAppointmentConfirmed(appointmentId: string): Promise<void> {
  const appointment = await appointmentRepository.findByIdWithDetails(appointmentId);
  if (!appointment) {
    logger.error({ appointmentId }, "notify_appointment_confirmed_appointment_missing");
    return;
  }

  const { customer, service, business } = appointment;
  const dateLabel = dateOnlyFromUTCDate(appointment.appointmentDate);
  const price = formatMoney(appointment.price.toString(), business.currency);

  try {
    if (await claimNotification(business.id, appointment.id, "APPOINTMENT_CONFIRMATION")) {
      const provider = getWhatsAppProvider();
      await provider.sendText(
        customer.phone,
        `¡Hola ${customer.name}! Tu reserva en ${business.name} quedó confirmada ✅\n\n` +
          `${service.name}\n${dateLabel} · ${appointment.startTime} - ${appointment.endTime}\n${price}\n\n` +
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
    if (await claimNotification(business.id, appointment.id, "BUSINESS_NEW_APPOINTMENT")) {
      const provider = getWhatsAppProvider();
      await provider.sendText(
        business.whatsappNumber,
        `Nueva reserva confirmada 📅\n\n` +
          `Cliente: ${customer.name} (${customer.phone})\n` +
          `Servicio: ${service.name}\n${dateLabel} · ${appointment.startTime} - ${appointment.endTime}\n` +
          `Valor: ${price}\nEstado de pago: PAID`,
      );
      logger.info({ appointmentId }, "whatsapp_business_notification_sent");
    }
  } catch (error) {
    logger.error({ appointmentId, error }, "whatsapp_business_notification_failed");
  }
}
