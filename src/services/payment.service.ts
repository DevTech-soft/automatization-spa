import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { businessRepository } from "../repositories/business.repository.js";
import { paymentRepository } from "../repositories/payment.repository.js";
import { getPaymentProvider } from "../integrations/payments/index.js";
import type { WebhookEventStatus } from "../integrations/payments/PaymentProvider.js";
import { NotFoundError, PaymentError, ValidationError, WebhookVerificationError } from "../errors/index.js";
import { dateOnlyFromUTCDate } from "../utils/datetime.js";
import { generateCode } from "../utils/code-generator.js";
import { notifyAppointmentConfirmed } from "./notification.service.js";
import { syncAppointmentToSheet } from "./google-sheets-sync.service.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export interface CreatePaymentForEntityInput {
  entityType: "APPOINTMENT" | "GIFT_CARD";
  entityId: string;
}

export interface CreatePaymentOutput {
  paymentUrl: string;
  reference: string;
}

/**
 * Punto de entrada de `POST /api/payments/create`. Gift Cards se implementan
 * en Fase 8 — hoy solo soporta reservas.
 */
export async function createPayment(input: CreatePaymentForEntityInput): Promise<CreatePaymentOutput> {
  if (input.entityType === "GIFT_CARD") {
    throw new ValidationError("La compra de Gift Cards aún no está disponible.");
  }
  return createPaymentForAppointment(input.entityId);
}

async function createPaymentForAppointment(appointmentId: string): Promise<CreatePaymentOutput> {
  const appointment = await appointmentRepository.findById(appointmentId);
  if (!appointment) {
    throw new NotFoundError("Reserva no encontrada.");
  }
  if (appointment.status !== "PENDING") {
    throw new ValidationError("Esta reserva ya no está pendiente de pago.");
  }
  if (appointment.expiresAt && appointment.expiresAt.getTime() < Date.now()) {
    throw new ValidationError("Esta reserva expiró. Por favor crea una nueva.");
  }

  const provider = getPaymentProvider();
  const redirectUrl = `${env.APP_URL}/gracias`;

  // Reutiliza la referencia existente si ya se generó un link de pago antes,
  // para no crear filas de payments huérfanas en cada click de "reintentar".
  if (appointment.paymentReference) {
    const existingPayment = await paymentRepository.findByReference(appointment.paymentReference);
    if (existingPayment && existingPayment.status === "PENDING") {
      const result = await provider.createPayment({
        reference: existingPayment.reference,
        amount: Number(existingPayment.amount),
        currency: existingPayment.currency,
        redirectUrl: `${redirectUrl}?ref=${existingPayment.reference}`,
      });
      return { paymentUrl: result.paymentUrl, reference: existingPayment.reference };
    }
  }

  const business = await businessRepository.findById(appointment.businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  const reference = generateCode("PAY");
  const result = await provider.createPayment({
    reference,
    amount: Number(appointment.price),
    currency: business.currency,
    redirectUrl: `${redirectUrl}?ref=${reference}`,
  });

  await prisma.$transaction(async (tx) => {
    await paymentRepository.create(
      {
        businessId: appointment.businessId,
        reference,
        provider: result.provider,
        amount: appointment.price,
        currency: business.currency,
        status: "PENDING",
        entityType: "APPOINTMENT",
        entityId: appointment.id,
      },
      tx,
    );
    await appointmentRepository.setPaymentReference(appointment.id, reference, tx);
  });

  return { paymentUrl: result.paymentUrl, reference };
}

function mapEventStatusToPaymentStatus(status: WebhookEventStatus): "PAID" | "FAILED" | "PENDING" {
  switch (status) {
    case "APPROVED":
      return "PAID";
    case "DECLINED":
    case "ERROR":
    case "VOIDED":
      return "FAILED";
    case "PENDING":
    default:
      return "PENDING";
  }
}

function isCapacityExceededError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("appointment_capacity_exceeded");
}

function appendConflictNote(existing: string | null): string {
  const note = "Pago recibido pero el horario ya no estaba disponible al confirmar — requiere revisión manual.";
  return existing ? `${existing}\n${note}` : note;
}

/**
 * Única fuente válida para confirmar un pago (sección 9): nunca se confía en
 * el frontend, query params, ni "ya pagué". Toda la validación (firma,
 * referencia, amount, currency) e idempotencia ocurre aquí.
 */
export async function processPaymentWebhook(rawPayload: unknown): Promise<void> {
  const provider = getPaymentProvider();

  if (!provider.validateWebhook(rawPayload)) {
    throw new WebhookVerificationError("Firma de webhook de pago inválida.");
  }

  const event = provider.parseWebhook(rawPayload);

  const confirmedAppointmentId = await prisma.$transaction(async (tx) => {
    // Serializa cualquier entrega concurrente/duplicada del mismo evento.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${event.reference})::bigint)`;

    const payment = await paymentRepository.findByReference(event.reference, tx);
    if (!payment) {
      logger.warn({ reference: event.reference, provider: event.provider }, "payment_webhook_unknown_reference");
      return null;
    }

    if (payment.status === "PAID" || payment.status === "FAILED" || payment.status === "REFUNDED") {
      // Idempotencia: webhook duplicado o replay de un evento ya procesado.
      logger.info({ reference: event.reference, status: payment.status }, "payment_webhook_already_processed");
      return null;
    }

    const expectedCents = Math.round(Number(payment.amount) * 100);
    if (expectedCents !== event.amountInCents || payment.currency.toUpperCase() !== event.currency.toUpperCase()) {
      logger.error(
        {
          reference: event.reference,
          expectedCents,
          receivedCents: event.amountInCents,
          expectedCurrency: payment.currency,
          receivedCurrency: event.currency,
        },
        "payment_webhook_mismatch",
      );
      throw new PaymentError("El monto o la moneda del pago no coinciden con lo esperado.");
    }

    const newStatus = mapEventStatusToPaymentStatus(event.status);
    if (newStatus === "PENDING") {
      return null;
    }

    await paymentRepository.updateStatus(
      payment.id,
      newStatus,
      event.transactionId,
      event.raw as Prisma.InputJsonValue,
      tx,
    );
    logger.info({ reference: event.reference, status: newStatus }, "payment_status_updated");

    if (newStatus !== "PAID") {
      return null; // FAILED: la reserva sigue PENDING, el cliente puede reintentar el pago.
    }

    if (payment.entityType === "APPOINTMENT") {
      const confirmed = await confirmAppointmentAfterPayment(payment.entityId, tx);
      return confirmed ? payment.entityId : null;
    }
    // GIFT_CARD: se implementa en Fase 8.
    return null;
  });

  if (confirmedAppointmentId) {
    // Fuera de la transacción a propósito: un fallo de WhatsApp o de Sheets
    // nunca debe revertir la confirmación del pago ya comprometida (sección 22).
    await notifyAppointmentConfirmed(confirmedAppointmentId).catch((error) => {
      logger.error({ appointmentId: confirmedAppointmentId, error }, "appointment_confirmation_notification_failed");
    });
    void syncAppointmentToSheet(confirmedAppointmentId);
  }
}

async function confirmAppointmentAfterPayment(
  appointmentId: string,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  const appointment = await appointmentRepository.findById(appointmentId, tx);
  if (!appointment) {
    logger.error({ appointmentId }, "payment_confirmed_appointment_missing");
    return false;
  }

  // Mismo lock que usa la creación de reservas (sección 12): evita que la
  // confirmación viole la capacity del servicio bajo concurrencia real, ya
  // que el trigger de Postgres por sí solo no serializa transacciones
  // concurrentes bajo READ COMMITTED.
  const dateStr = dateOnlyFromUTCDate(appointment.appointmentDate);
  const lockKey = `${appointment.businessId}:${appointment.serviceId}:${dateStr}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;

  try {
    const confirmed = await appointmentRepository.confirmIfPending(appointmentId, tx);
    if (confirmed) {
      logger.info({ appointmentId }, "appointment_confirmed");
    } else {
      logger.info({ appointmentId, status: appointment.status }, "appointment_confirm_skipped_not_pending");
    }
    return confirmed;
  } catch (error) {
    if (isCapacityExceededError(error)) {
      await appointmentRepository.markPaymentConflict(appointmentId, appendConflictNote(appointment.notes), tx);
      logger.error({ appointmentId }, "appointment_payment_conflict_needs_manual_review");
      return false;
    }
    throw error;
  }
}
