import { appointmentRepository } from "../repositories/appointment.repository.js";
import { customerRepository } from "../repositories/customer.repository.js";
import { giftCardRepository } from "../repositories/giftCard.repository.js";
import { getGoogleSheetsProvider } from "../integrations/google-sheets/index.js";
import { dateOnlyFromUTCDate } from "../utils/datetime.js";
import { logger } from "../utils/logger.js";

/**
 * Sincronización hacia la vista administrativa de Google Sheets (sección 19).
 * Nunca lanza: un fallo de Sheets jamás debe romper una reserva ni un pago —
 * ver sección 2 ("Google Sheets = vista administrativa", nunca fuente de
 * verdad) y el principio ya aplicado en `notification.service.ts`.
 */

const RESERVAS_SHEET = "RESERVAS";
const RESERVAS_HEADERS = [
  "ID",
  "Código",
  "Cliente",
  "Teléfono",
  "Servicio",
  "Fecha",
  "Hora",
  "Valor",
  "Estado",
  "Estado pago",
  "Origen",
  "Fecha creación",
];

const CLIENTES_SHEET = "CLIENTES";
const CLIENTES_HEADERS = ["ID", "Nombre", "Teléfono", "Email", "Última reserva", "Número de reservas"];

const GIFT_CARDS_SHEET = "GIFT CARDS";
const GIFT_CARDS_HEADERS = [
  "ID",
  "Código",
  "Comprador",
  "Teléfono comprador",
  "Destinatario",
  "Servicio",
  "Valor",
  "Fecha compra",
  "Fecha uso",
  "Estado",
];

export async function syncAppointmentToSheet(appointmentId: string): Promise<void> {
  try {
    const appointment = await appointmentRepository.findByIdWithDetails(appointmentId);
    if (!appointment) {
      logger.warn({ appointmentId }, "google_sheets_sync_appointment_missing");
      return;
    }

    const provider = getGoogleSheetsProvider();
    await provider.ensureSheet(RESERVAS_SHEET, RESERVAS_HEADERS);
    await provider.upsertRow(RESERVAS_SHEET, appointment.id, [
      appointment.id,
      appointment.appointmentCode,
      appointment.customer.name,
      appointment.customer.phone,
      appointment.service.name,
      dateOnlyFromUTCDate(appointment.appointmentDate),
      appointment.startTime,
      appointment.price.toString(),
      appointment.status,
      appointment.paymentStatus,
      appointment.source,
      appointment.createdAt.toISOString(),
    ]);
    logger.info({ appointmentId }, "google_sheet_synced");
  } catch (error) {
    logger.error({ appointmentId, error }, "google_sheets_sync_appointment_failed");
  }
}

export async function syncCustomerToSheet(customerId: string): Promise<void> {
  try {
    const customer = await customerRepository.findById(customerId);
    if (!customer) {
      logger.warn({ customerId }, "google_sheets_sync_customer_missing");
      return;
    }
    const stats = await customerRepository.getAppointmentStats(customerId);

    const provider = getGoogleSheetsProvider();
    await provider.ensureSheet(CLIENTES_SHEET, CLIENTES_HEADERS);
    await provider.upsertRow(CLIENTES_SHEET, customer.id, [
      customer.id,
      customer.name,
      customer.phone,
      customer.email ?? "",
      stats.lastAppointmentDate ? dateOnlyFromUTCDate(stats.lastAppointmentDate) : "",
      String(stats.totalAppointments),
    ]);
    logger.info({ customerId }, "google_sheet_synced");
  } catch (error) {
    logger.error({ customerId, error }, "google_sheets_sync_customer_failed");
  }
}

export async function syncGiftCardToSheet(giftCardId: string): Promise<void> {
  try {
    const giftCard = await giftCardRepository.findById(giftCardId);
    if (!giftCard) {
      logger.warn({ giftCardId }, "google_sheets_sync_gift_card_missing");
      return;
    }

    const provider = getGoogleSheetsProvider();
    await provider.ensureSheet(GIFT_CARDS_SHEET, GIFT_CARDS_HEADERS);
    await provider.upsertRow(GIFT_CARDS_SHEET, giftCard.id, [
      giftCard.id,
      giftCard.code,
      giftCard.buyerName,
      giftCard.buyerPhone,
      giftCard.recipientName,
      giftCard.service?.name ?? "",
      giftCard.amount.toString(),
      giftCard.createdAt.toISOString(),
      giftCard.redeemedAt ? giftCard.redeemedAt.toISOString() : "",
      giftCard.status,
    ]);
    logger.info({ giftCardId }, "google_sheet_synced");
  } catch (error) {
    logger.error({ giftCardId, error }, "google_sheets_sync_gift_card_failed");
  }
}
