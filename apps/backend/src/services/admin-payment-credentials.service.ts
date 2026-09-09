import type { PaymentCredentialsDto, UpsertPaymentCredentialsInput } from "@spa/shared";
import { paymentCredentialsRepository } from "../repositories/paymentCredentials.repository.js";
import { adminBusinessRepository } from "../repositories/adminBusiness.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import { NotFoundError } from "../errors/index.js";
import { env } from "../config/env.js";
import { maskSecret } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";

/**
 * Llaves de Wompi por negocio desde el panel (docs/PANEL-OPERADOR.md §D3/§D6).
 * El operador crea la cuenta de Wompi del cliente y registra las llaves aquí;
 * el panel **almacena y administra**, no provisiona.
 *
 * Las llaves entran en claro una sola vez y salen siempre enmascaradas. Sin
 * llaves propias el negocio cae a las `PAYMENT_*` globales del operador
 * (fallback de F2), lo que el DTO señala con `usingGlobalFallback` — y el
 * checklist de onboarding lo marca como paso pendiente.
 */

function globalFallbackDto(businessId: string): PaymentCredentialsDto {
  const configured = Boolean(env.PAYMENT_API_KEY);
  return {
    businessId,
    provider: env.PAYMENT_PROVIDER,
    environment: "PROD",
    configuredAt: null,
    apiKeyMask: configured ? "•••• (global)" : "—",
    publicKeyMask: configured ? "•••• (global)" : "—",
    integritySecretMask: configured ? "•••• (global)" : "—",
    webhookSecretMask: configured ? "•••• (global)" : "—",
    usingGlobalFallback: true,
  };
}

export async function getPaymentCredentials(businessId: string): Promise<PaymentCredentialsDto> {
  const business = await adminBusinessRepository.findDetail(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  const row = await paymentCredentialsRepository.findRowByBusinessId(businessId);
  if (!row) {
    return globalFallbackDto(businessId);
  }

  return {
    businessId,
    provider: row.provider,
    environment: row.environment,
    configuredAt: row.updatedAt.toISOString(),
    apiKeyMask: maskSecret(row.apiKeyEnc),
    publicKeyMask: maskSecret(row.publicKeyEnc),
    integritySecretMask: maskSecret(row.integritySecretEnc),
    webhookSecretMask: maskSecret(row.webhookSecretEnc),
    usingGlobalFallback: false,
  };
}

export async function upsertPaymentCredentials(
  businessId: string,
  input: UpsertPaymentCredentialsInput,
  actor: string,
): Promise<PaymentCredentialsDto> {
  const business = await adminBusinessRepository.findDetail(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  const before = await paymentCredentialsRepository.findRowByBusinessId(businessId);
  await paymentCredentialsRepository.upsert(businessId, {
    apiKey: input.apiKey,
    publicKey: input.publicKey,
    integritySecret: input.integritySecret,
    webhookSecret: input.webhookSecret,
    environment: input.environment,
  });

  // La bitácora guarda que las llaves cambiaron y de qué entorno son — jamás
  // los valores, ni siquiera cifrados (§9).
  await auditLogRepository.record({
    actor,
    action: "payment.credentials.upsert",
    businessId,
    before: before ? { environment: before.environment, hadCredentials: true } : { hadCredentials: false },
    after: { environment: input.environment, hadCredentials: true },
  });
  logger.info({ actor, businessId, environment: input.environment }, "admin_payment_credentials_upserted");

  return getPaymentCredentials(businessId);
}

/** Borra las llaves propias: el negocio vuelve al fallback global del operador. */
export async function deletePaymentCredentials(
  businessId: string,
  actor: string,
): Promise<PaymentCredentialsDto> {
  const before = await paymentCredentialsRepository.findRowByBusinessId(businessId);
  if (!before) {
    throw new NotFoundError("Este negocio no tiene llaves propias configuradas.");
  }

  await paymentCredentialsRepository.delete(businessId);

  await auditLogRepository.record({
    actor,
    action: "payment.credentials.delete",
    businessId,
    before: { environment: before.environment, hadCredentials: true },
    after: { hadCredentials: false },
  });
  logger.warn({ actor, businessId }, "admin_payment_credentials_deleted");

  return getPaymentCredentials(businessId);
}
