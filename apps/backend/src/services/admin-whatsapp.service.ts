import type {
  ConnectWhatsAppInput,
  UpdateWhatsAppInput,
  WhatsAppAccountDto,
  WhatsAppHealth,
} from "@spa/shared";
import type { Prisma, WhatsAppAccount } from "@spa/db";
import { whatsAppAccountRepository } from "../repositories/whatsAppAccount.repository.js";
import { adminBusinessRepository } from "../repositories/adminBusiness.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import { NotFoundError, ValidationError } from "../errors/index.js";
import { maskSecret } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";

/**
 * Conexión del número de WhatsApp de cada cliente (docs/PANEL-OPERADOR.md §7).
 *
 * Hoy el operador registra el número a mano —el **puente de §7.3**, con el
 * número del cliente dado de alta bajo la WABA del operador— porque el Embedded
 * Signup exige la verificación de negocio en Meta, que a su vez exige la
 * formalización pendiente (D7/M-1). Cuando eso desbloquee, el callback del
 * signup embebido escribe estos mismos campos: `connectWhatsAppAccount` es el
 * punto único de entrada, y el flujo de Meta lo llamará con los datos que
 * devuelva el token exchange en vez de con los del formulario.
 *
 * El token se guarda cifrado (AES-256-GCM, §9) y nunca vuelve a salir: el panel
 * solo ve una máscara.
 */

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

function toDto(row: WhatsAppAccount): WhatsAppAccountDto {
  return {
    id: row.id,
    businessId: row.businessId,
    wabaId: row.wabaId,
    phoneNumberId: row.phoneNumberId,
    displayPhoneNumber: row.displayPhoneNumber,
    displayName: row.displayName,
    accessTokenMask: maskSecret(row.accessTokenEnc),
    subscriptionStatus: row.subscriptionStatus,
    qualityRating: row.qualityRating,
    messagingLimit: row.messagingLimit,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireBusiness(businessId: string): Promise<void> {
  const business = await adminBusinessRepository.findDetail(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }
}

async function requireAccount(businessId: string, accountId: string): Promise<WhatsAppAccount> {
  const row = await whatsAppAccountRepository.find(accountId);
  if (!row || row.businessId !== businessId) {
    throw new NotFoundError("Número de WhatsApp no encontrado para este negocio.");
  }
  return row;
}

export async function listWhatsAppAccounts(businessId: string): Promise<WhatsAppAccountDto[]> {
  await requireBusiness(businessId);
  const rows = await whatsAppAccountRepository.listByBusiness(businessId);
  return rows.map(toDto);
}

export async function connectWhatsAppAccount(
  businessId: string,
  input: ConnectWhatsAppInput,
  actor: string,
): Promise<WhatsAppAccountDto> {
  await requireBusiness(businessId);

  // El `phone_number_id` es la llave con la que el webhook resuelve el tenant
  // (§7.2). Si ya está tomado por otro negocio, reasignarlo en silencio le
  // robaría las conversaciones al cliente anterior.
  const existing = await whatsAppAccountRepository.findByPhoneNumberId(input.phoneNumberId);
  if (existing && existing.businessId !== businessId) {
    throw new ValidationError(
      "Ese número ya está conectado a otro negocio. Desconéctalo de allí antes de reasignarlo.",
    );
  }

  const row = await whatsAppAccountRepository.connect(businessId, {
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId,
    displayPhoneNumber: input.displayPhoneNumber || null,
    displayName: input.displayName || null,
    accessToken: input.accessToken,
  });
  const dto = toDto(row);

  await auditLogRepository.record({
    actor,
    action: "whatsapp.account.connect",
    businessId,
    after: { ...dto, accessTokenMask: undefined } as unknown as Prisma.InputJsonValue,
  });
  logger.info({ actor, businessId, phoneNumberId: input.phoneNumberId }, "admin_whatsapp_connected");

  return dto;
}

export async function updateWhatsAppAccount(
  businessId: string,
  accountId: string,
  input: UpdateWhatsAppInput,
  actor: string,
): Promise<WhatsAppAccountDto> {
  const before = await requireAccount(businessId, accountId);

  const data: Prisma.WhatsAppAccountUpdateInput = {
    ...(input.displayPhoneNumber !== undefined
      ? { displayPhoneNumber: input.displayPhoneNumber || null }
      : {}),
    ...(input.displayName !== undefined ? { displayName: input.displayName || null } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };

  let row = Object.keys(data).length > 0
    ? await whatsAppAccountRepository.update(accountId, data)
    : before;

  if (input.accessToken) {
    row = await whatsAppAccountRepository.setAccessToken(accountId, input.accessToken);
  }

  const dto = toDto(row);
  await auditLogRepository.record({
    actor,
    action: "whatsapp.account.update",
    businessId,
    before: { displayName: before.displayName, active: before.active },
    after: { displayName: dto.displayName, active: dto.active, tokenRotated: Boolean(input.accessToken) },
  });
  logger.info({ actor, businessId, accountId }, "admin_whatsapp_updated");

  return dto;
}

export async function disconnectWhatsAppAccount(
  businessId: string,
  accountId: string,
  actor: string,
): Promise<void> {
  const before = await requireAccount(businessId, accountId);
  await whatsAppAccountRepository.delete(accountId);

  await auditLogRepository.record({
    actor,
    action: "whatsapp.account.disconnect",
    businessId,
    before: { phoneNumberId: before.phoneNumberId, displayName: before.displayName },
  });
  logger.warn({ actor, businessId, accountId }, "admin_whatsapp_disconnected");
}

/**
 * Comprueba contra la Graph API que el token del negocio siga sirviendo y trae
 * de paso la calidad y el límite de mensajería que Meta reporta para ese número
 * (§7.2). Se guarda lo que devuelve: es la única fuente de esos campos.
 *
 * Nunca lanza por un fallo de Meta — un número mal configurado es información
 * para el operador, no un error del panel.
 */
export async function verifyWhatsAppAccount(
  businessId: string,
  accountId: string,
): Promise<WhatsAppHealth> {
  await requireAccount(businessId, accountId);
  const credentials = await whatsAppAccountRepository.findCredentialsByBusinessId(businessId);
  if (!credentials || credentials.accountId !== accountId) {
    return { ok: false, detail: "El número está inactivo; actívalo antes de verificarlo." };
  }

  try {
    const url = `${GRAPH_API_BASE}/${credentials.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    const body = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const message = ((body.error as Record<string, unknown> | undefined)?.message as string) ?? "";
      return {
        ok: false,
        detail: `Meta respondió ${response.status}${message ? `: ${message}` : "."}`,
      };
    }

    const health: WhatsAppHealth = {
      ok: true,
      detail: "Meta reconoce el número y el token es válido.",
      displayPhoneNumber: (body.display_phone_number as string) ?? null,
      verifiedName: (body.verified_name as string) ?? null,
      qualityRating: (body.quality_rating as string) ?? null,
      messagingLimit: (body.messaging_limit_tier as string) ?? null,
    };

    await whatsAppAccountRepository.update(accountId, {
      displayPhoneNumber: health.displayPhoneNumber ?? undefined,
      displayName: health.verifiedName ?? undefined,
      qualityRating: health.qualityRating ?? undefined,
      messagingLimit: health.messagingLimit ?? undefined,
    });

    return health;
  } catch (error) {
    logger.error({ businessId, accountId, error }, "admin_whatsapp_verify_failed");
    return { ok: false, detail: "No se pudo contactar a la Graph API de Meta." };
  }
}
