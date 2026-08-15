import { DateTime } from "luxon";
import type { Prisma } from "@prisma/client";
import { businessRepository } from "../repositories/business.repository.js";
import { serviceRepository } from "../repositories/service.repository.js";
import { giftCardRepository } from "../repositories/giftCard.repository.js";
import {
  GiftCardAlreadyRedeemedError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../errors/index.js";
import { generateCode } from "../utils/code-generator.js";
import { isUniqueConstraintViolation } from "../utils/prisma-errors.js";
import { normalizePhone } from "../utils/phone.js";
import { dateOnlyToUTCDate } from "../utils/datetime.js";
import { env } from "../config/env.js";
import { DEFAULT_GIFT_CARD_VALIDITY_DAYS } from "../config/constants.js";
import { getStorageProvider } from "../integrations/storage/index.js";
import { renderGiftCardImage } from "./gift-card-image.service.js";
import { notifyGiftCardCreated } from "./notification.service.js";
import { syncGiftCardToSheet } from "./google-sheets-sync.service.js";
import { logger } from "../utils/logger.js";

const MAX_CODE_ATTEMPTS = 5;

export interface CreateGiftCardInput {
  businessId: string;
  serviceId: string;
  design: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string | undefined;
  recipientName: string;
  recipientPhone?: string | undefined;
  recipientEmail?: string | undefined;
  message?: string | undefined;
  scheduledDate?: string | undefined;
}

function getValidityDays(settings: unknown): number {
  const value = (settings as Record<string, unknown> | null)?.["gift_card_validity_days"];
  return typeof value === "number" && value > 0 ? value : DEFAULT_GIFT_CARD_VALIDITY_DAYS;
}

/**
 * Crea la Gift Card en PENDING. El código único se genera aquí, no después
 * de pagar como sugiere literalmente la sección 15 — mismo patrón que
 * `appointment_code` (sección 8), reintenta ante colisión. El código no es
 * utilizable hasta que `status` sea PAID/SENT (validate/redeem siempre
 * revisan el estado, no solo la existencia del código) — ver docs/GIFT-CARDS.md.
 */
export async function createGiftCard(input: CreateGiftCardInput) {
  const business = await businessRepository.findById(input.businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  const service = await serviceRepository.findActiveById(input.businessId, input.serviceId);
  if (!service) {
    throw new NotFoundError("Servicio no encontrado.");
  }

  const expiresAt = DateTime.now().plus({ days: getValidityDays(business.settings) }).toJSDate();

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      return await giftCardRepository.create({
        businessId: input.businessId,
        serviceId: input.serviceId,
        code: generateCode("GIFT"),
        amount: service.price,
        design: input.design,
        buyerName: input.buyerName,
        buyerPhone: normalizePhone(input.buyerPhone),
        buyerEmail: input.buyerEmail,
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone ? normalizePhone(input.recipientPhone) : undefined,
        recipientEmail: input.recipientEmail,
        message: input.message,
        scheduledDate: input.scheduledDate ? dateOnlyToUTCDate(input.scheduledDate) : undefined,
        status: "PENDING",
        paymentStatus: "PENDING",
        expiresAt,
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("No se pudo generar un código de Gift Card único tras varios intentos.");
}

/** Llamado dentro de la transacción del webhook de pago (payment.service.ts). Idempotente. */
export async function confirmGiftCardPayment(giftCardId: string, tx: Prisma.TransactionClient): Promise<boolean> {
  const giftCard = await tx.giftCard.findUnique({ where: { id: giftCardId } });
  if (!giftCard) {
    logger.error({ giftCardId }, "payment_confirmed_gift_card_missing");
    return false;
  }
  if (giftCard.status !== "PENDING") {
    logger.info({ giftCardId, status: giftCard.status }, "gift_card_confirm_skipped_not_pending");
    return false;
  }

  await giftCardRepository.confirmPayment(giftCardId, tx);
  logger.info({ giftCardId }, "gift_card_confirmed");
  return true;
}

/**
 * Pipeline posterior al pago (sección 15, pasos 3-8), fuera de la transacción
 * a propósito — Puppeteer y las llamadas a Storage/WhatsApp/Sheets nunca
 * deben poder revertir un pago ya confirmado (mismo principio que
 * `notifyAppointmentConfirmed`).
 */
export async function finalizeGiftCardAfterPayment(giftCardId: string): Promise<void> {
  const giftCard = await giftCardRepository.findById(giftCardId);
  if (!giftCard) {
    logger.error({ giftCardId }, "finalize_gift_card_missing");
    return;
  }

  let pdfUrl = giftCard.pdfUrl;
  if (!pdfUrl) {
    try {
      const business = await businessRepository.findById(giftCard.businessId);
      const imageBuffer = await renderGiftCardImage({
        businessName: business?.name ?? "",
        recipientName: giftCard.recipientName,
        buyerName: giftCard.buyerName,
        serviceName: giftCard.service?.name ?? "",
        message: giftCard.message ?? undefined,
        code: giftCard.code,
        design: giftCard.design ?? "clasico",
      });
      const storage = getStorageProvider();
      const path = `${giftCard.businessId}/${giftCard.code}.png`;
      await storage.upload(path, imageBuffer, "image/png");
      pdfUrl = storage.getPublicUrl(path);
      await giftCardRepository.setPdfUrl(giftCardId, pdfUrl);
      logger.info({ giftCardId }, "gift_card_image_generated");
    } catch (error) {
      logger.error({ giftCardId, error }, "gift_card_image_generation_failed");
    }
  }

  void syncGiftCardToSheet(giftCardId);

  await notifyGiftCardCreated(giftCardId, pdfUrl ?? null).catch((error) => {
    logger.error({ giftCardId, error }, "gift_card_notification_failed");
  });
}

export interface GiftCardValidationResult {
  valid: boolean;
  status: string;
  serviceName: string;
  recipientName: string;
  buyerName: string;
  amount: string;
  purchasedAt: string;
  expiresAt: string | null;
}

/** Sección 16: consulta pública, no requiere STAFF_PIN (solo el canje lo requiere). */
export async function validateGiftCard(code: string): Promise<GiftCardValidationResult> {
  const giftCard = await giftCardRepository.findByCodeGlobal(code);
  if (!giftCard) {
    throw new NotFoundError("No existe una Gift Card con ese código.");
  }

  const isExpired = giftCard.expiresAt !== null && giftCard.expiresAt.getTime() < Date.now();
  const valid = (giftCard.status === "PAID" || giftCard.status === "SENT") && !isExpired;

  return {
    valid,
    status: isExpired && giftCard.status !== "REDEEMED" ? "EXPIRED" : giftCard.status,
    serviceName: giftCard.service?.name ?? "",
    recipientName: giftCard.recipientName,
    buyerName: giftCard.buyerName,
    amount: giftCard.amount.toString(),
    purchasedAt: giftCard.createdAt.toISOString(),
    expiresAt: giftCard.expiresAt ? giftCard.expiresAt.toISOString() : null,
  };
}

/**
 * Sección 16: canje atómico, protegido por STAFF_PIN (sección 7 / ARCHITECTURE.md
 * — "dejar el canje sin ninguna protección es un riesgo real"). Si no hay
 * STAFF_PIN configurado, se rechaza en vez de permitir un canje sin control.
 */
export async function redeemGiftCard(code: string, staffPin: string): Promise<void> {
  if (!env.STAFF_PIN) {
    throw new UnauthorizedError("El canje de Gift Cards no está configurado (falta STAFF_PIN).");
  }
  if (staffPin !== env.STAFF_PIN) {
    throw new UnauthorizedError("PIN de staff inválido.");
  }

  const giftCard = await giftCardRepository.findByCodeGlobal(code);
  if (!giftCard) {
    throw new NotFoundError("No existe una Gift Card con ese código.");
  }
  if (giftCard.status === "REDEEMED") {
    throw new GiftCardAlreadyRedeemedError("Esta Gift Card ya fue canjeada.");
  }
  if (giftCard.expiresAt && giftCard.expiresAt.getTime() < Date.now()) {
    throw new ValidationError("Esta Gift Card expiró.");
  }
  if (giftCard.status !== "PAID" && giftCard.status !== "SENT") {
    throw new ValidationError("Esta Gift Card todavía no está pagada.");
  }

  const redeemed = await giftCardRepository.redeemIfValid(code);
  if (!redeemed) {
    // Alguien más la canjeó entre el chequeo de arriba y el update atómico.
    throw new GiftCardAlreadyRedeemedError("Esta Gift Card ya fue canjeada.");
  }
  logger.info({ code }, "gift_card_redeemed");
}

export interface GiftCardStatusResult {
  code: string;
  status: string;
  paymentStatus: string;
  serviceName: string;
  recipientName: string;
  amount: string;
  pdfUrl: string | null;
}

/** Usado por `/gracias?type=gift` (mismo patrón que appointment status, Fase 5). */
export async function getGiftCardStatusByReference(reference: string): Promise<GiftCardStatusResult> {
  const giftCard = await giftCardRepository.findByPaymentReference(reference);
  if (!giftCard) {
    throw new NotFoundError("No se encontró una Gift Card con esa referencia de pago.");
  }
  const withService = await giftCardRepository.findById(giftCard.id);

  return {
    code: giftCard.code,
    status: giftCard.status,
    paymentStatus: giftCard.paymentStatus,
    serviceName: withService?.service?.name ?? "",
    recipientName: giftCard.recipientName,
    amount: giftCard.amount.toString(),
    pdfUrl: giftCard.pdfUrl,
  };
}

