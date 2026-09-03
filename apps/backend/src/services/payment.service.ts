import type { Business, Prisma } from "@spa/db";
import { prisma } from "../db/prisma.js";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { businessRepository } from "../repositories/business.repository.js";
import { paymentRepository } from "../repositories/payment.repository.js";
import { paymentCredentialsRepository } from "../repositories/paymentCredentials.repository.js";
import { giftCardRepository } from "../repositories/giftCard.repository.js";
import {
  extractWebhookReference,
  getPaymentProvider,
  getPaymentProviderForCredentials,
} from "../integrations/payments/index.js";
import type { PaymentProvider, WebhookEventStatus } from "../integrations/payments/PaymentProvider.js";
import { NotFoundError, PaymentError, ValidationError, WebhookVerificationError } from "../errors/index.js";
import { dateOnlyFromUTCDate } from "../utils/datetime.js";
import { generateCode } from "../utils/code-generator.js";
import { notifyAppointmentConfirmed } from "./notification.service.js";
import { syncAppointmentToSheet } from "./google-sheets-sync.service.js";
import { confirmGiftCardPayment, finalizeGiftCardAfterPayment } from "./gift-card.service.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export interface CreatePaymentForEntityInput {
  entityType: "APPOINTMENT" | "GIFT_CARD";
  entityId: string;
}

export interface CreatePaymentOutput {
  paymentUrl: string;
  reference: string;
  /** `TOTAL` = link por el 100%; `DEPOSIT` = link por el abono, resto presencial (§6.2). */
  chargeMode: "TOTAL" | "DEPOSIT";
  /** Monto que cobra el link (el total, o el abono en modo DEPOSIT). */
  amount: number;
  /** Saldo a pagar en el local. `null` salvo en modo DEPOSIT. */
  pendingBalance: number | null;
}

/** Punto de entrada de `POST /api/payments/create` — soporta reservas y Gift Cards. */
export async function createPayment(input: CreatePaymentForEntityInput): Promise<CreatePaymentOutput> {
  if (input.entityType === "GIFT_CARD") {
    return createPaymentForGiftCard(input.entityId);
  }
  return createPaymentForAppointment(input.entityId);
}

/**
 * Resuelve la pasarela de pago de un negocio (docs/PANEL-OPERADOR.md §D3): usa
 * sus `PaymentCredentials` cifradas si las tiene, y cae a las env `PAYMENT_*`
 * globales mientras no las configure (el demo sigue cobrando sin cambios).
 */
async function resolveProviderForBusiness(businessId: string): Promise<PaymentProvider> {
  const creds = await paymentCredentialsRepository.findByBusinessId(businessId);
  if (creds) {
    return getPaymentProviderForCredentials({
      provider: creds.provider,
      publicKey: creds.publicKey,
      integritySecret: creds.integritySecret,
      webhookSecret: creds.webhookSecret,
    });
  }
  logger.info({ businessId }, "payment_provider_env_fallback");
  return getPaymentProvider();
}

interface ChargeSplit {
  chargeMode: "TOTAL" | "DEPOSIT";
  /** Monto del link de pago. */
  amount: number;
  /** Solo en DEPOSIT: lo que se cobra online. */
  depositAmount: number | null;
  /** Solo en DEPOSIT: lo que se paga en el local. */
  pendingBalance: number | null;
}

/**
 * Divide el precio de una reserva según `business.chargeMode` (§6.2). En modo
 * DEPOSIT con un porcentaje válido (1–99) el link cobra `precio × %` y el resto
 * queda como saldo presencial; con 100 (o sin porcentaje) se comporta como TOTAL.
 */
function computeAppointmentCharge(
  price: Prisma.Decimal,
  business: Pick<Business, "chargeMode" | "depositPercentage">,
): ChargeSplit {
  const full = Number(price);
  const pct = business.depositPercentage ?? 0;

  if (business.chargeMode === "DEPOSIT" && pct >= 1 && pct < 100) {
    const depositAmount = Math.round((full * pct) / 100);
    return { chargeMode: "DEPOSIT", amount: depositAmount, depositAmount, pendingBalance: full - depositAmount };
  }

  return { chargeMode: "TOTAL", amount: full, depositAmount: null, pendingBalance: null };
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

  const provider = await resolveProviderForBusiness(appointment.businessId);
  const redirectUrl = `${env.APP_URL}/gracias`;

  // Reutiliza la referencia existente si ya se generó un link de pago antes,
  // para no crear filas de payments huérfanas en cada click de "reintentar".
  // El split del abono ya está persistido en la cita desde la primera vez.
  if (appointment.paymentReference) {
    const existingPayment = await paymentRepository.findByReference(appointment.paymentReference);
    if (existingPayment && existingPayment.status === "PENDING") {
      const result = await provider.createPayment({
        reference: existingPayment.reference,
        amount: Number(existingPayment.amount),
        currency: existingPayment.currency,
        redirectUrl: `${redirectUrl}?ref=${existingPayment.reference}`,
      });
      const isDeposit = appointment.depositAmount != null;
      return {
        paymentUrl: result.paymentUrl,
        reference: existingPayment.reference,
        chargeMode: isDeposit ? "DEPOSIT" : "TOTAL",
        amount: Number(existingPayment.amount),
        pendingBalance: appointment.pendingBalance != null ? Number(appointment.pendingBalance) : null,
      };
    }
  }

  const business = await businessRepository.findById(appointment.businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  const charge = computeAppointmentCharge(appointment.price, business);
  const reference = generateCode("PAY");
  const result = await provider.createPayment({
    reference,
    amount: charge.amount,
    currency: business.currency,
    redirectUrl: `${redirectUrl}?ref=${reference}`,
  });

  await prisma.$transaction(async (tx) => {
    await paymentRepository.create(
      {
        businessId: appointment.businessId,
        reference,
        provider: result.provider,
        amount: charge.amount,
        currency: business.currency,
        status: "PENDING",
        entityType: "APPOINTMENT",
        entityId: appointment.id,
      },
      tx,
    );
    await appointmentRepository.setPaymentReference(appointment.id, reference, tx);
    if (charge.depositAmount != null && charge.pendingBalance != null) {
      await appointmentRepository.setDepositSplit(appointment.id, charge.depositAmount, charge.pendingBalance, tx);
    }
  });

  return {
    paymentUrl: result.paymentUrl,
    reference,
    chargeMode: charge.chargeMode,
    amount: charge.amount,
    pendingBalance: charge.pendingBalance,
  };
}

async function createPaymentForGiftCard(giftCardId: string): Promise<CreatePaymentOutput> {
  const giftCard = await giftCardRepository.findById(giftCardId);
  if (!giftCard) {
    throw new NotFoundError("Gift Card no encontrada.");
  }
  if (giftCard.status !== "PENDING") {
    throw new ValidationError("Esta Gift Card ya no está pendiente de pago.");
  }

  const provider = await resolveProviderForBusiness(giftCard.businessId);
  // `type=gift` le indica a /gracias qué endpoint de estado consultar (ver docs/GIFT-CARDS.md).
  const redirectUrl = `${env.APP_URL}/gracias?type=gift`;

  // Las Gift Cards siempre se cobran al 100% — el modo `abono` es solo para
  // reservas (docs/PANEL-OPERADOR.md §6.2, decisión de F2).
  if (giftCard.paymentReference) {
    const existingPayment = await paymentRepository.findByReference(giftCard.paymentReference);
    if (existingPayment && existingPayment.status === "PENDING") {
      const result = await provider.createPayment({
        reference: existingPayment.reference,
        amount: Number(existingPayment.amount),
        currency: existingPayment.currency,
        redirectUrl: `${redirectUrl}&ref=${existingPayment.reference}`,
      });
      return {
        paymentUrl: result.paymentUrl,
        reference: existingPayment.reference,
        chargeMode: "TOTAL",
        amount: Number(existingPayment.amount),
        pendingBalance: null,
      };
    }
  }

  const business = await businessRepository.findById(giftCard.businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  const reference = generateCode("PAY");
  const result = await provider.createPayment({
    reference,
    amount: Number(giftCard.amount),
    currency: business.currency,
    redirectUrl: `${redirectUrl}&ref=${reference}`,
  });

  await prisma.$transaction(async (tx) => {
    await paymentRepository.create(
      {
        businessId: giftCard.businessId,
        reference,
        provider: result.provider,
        amount: giftCard.amount,
        currency: business.currency,
        status: "PENDING",
        entityType: "GIFT_CARD",
        entityId: giftCard.id,
      },
      tx,
    );
    await giftCardRepository.setPaymentReference(giftCard.id, reference, tx);
  });

  return {
    paymentUrl: result.paymentUrl,
    reference,
    chargeMode: "TOTAL",
    amount: Number(giftCard.amount),
    pendingBalance: null,
  };
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
  // §6.3 — webhook multi-comercio: se lee la `reference` SIN validar, se resuelve
  // el negocio dueño del Payment, y recién ahí se valida la firma con el secreto
  // de ESE comercio. El `reference` no es secreto pero un atacante que lo adivine
  // igual no puede falsificar la firma del comercio correcto.
  const reference = extractWebhookReference(rawPayload);
  if (!reference) {
    throw new WebhookVerificationError("No se pudo leer la referencia del webhook de pago.");
  }

  const knownPayment = await paymentRepository.findByReference(reference);
  if (!knownPayment) {
    logger.warn({ reference }, "payment_webhook_unknown_reference");
    return; // 200: referencia desconocida, nada que confirmar.
  }

  const provider = await resolveProviderForBusiness(knownPayment.businessId);

  if (!provider.validateWebhook(rawPayload)) {
    throw new WebhookVerificationError("Firma de webhook de pago inválida.");
  }

  const event = provider.parseWebhook(rawPayload);

  const confirmed = await prisma.$transaction(async (tx) => {
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
      const wasConfirmed = await confirmAppointmentAfterPayment(payment.entityId, tx);
      return wasConfirmed ? ({ kind: "APPOINTMENT", id: payment.entityId } as const) : null;
    }

    const wasConfirmed = await confirmGiftCardPayment(payment.entityId, tx);
    return wasConfirmed ? ({ kind: "GIFT_CARD", id: payment.entityId } as const) : null;
  });

  if (!confirmed) {
    return;
  }

  // Fuera de la transacción a propósito: un fallo de WhatsApp, Sheets o de la
  // generación de la Gift Card nunca debe revertir la confirmación del pago
  // ya comprometida (sección 22).
  if (confirmed.kind === "APPOINTMENT") {
    await notifyAppointmentConfirmed(confirmed.id).catch((error) => {
      logger.error({ appointmentId: confirmed.id, error }, "appointment_confirmation_notification_failed");
    });
    void syncAppointmentToSheet(confirmed.id);
  } else {
    await finalizeGiftCardAfterPayment(confirmed.id).catch((error) => {
      logger.error({ giftCardId: confirmed.id, error }, "gift_card_finalization_failed");
    });
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

  // Si la reserva se creó con link de abono (§6.2), el pago recibido es el
  // abono, no el total: `paymentStatus` queda en DEPOSIT_PAID y el saldo se
  // cobra en el local.
  const paymentStatus = appointment.depositAmount != null ? "DEPOSIT_PAID" : "PAID";

  try {
    const confirmed = await appointmentRepository.confirmIfPending(appointmentId, tx, paymentStatus);
    if (confirmed) {
      logger.info({ appointmentId, paymentStatus }, "appointment_confirmed");
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
