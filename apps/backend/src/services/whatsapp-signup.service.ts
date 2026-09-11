import type {
  EmbeddedSignupCallbackInput,
  EmbeddedSignupConfigDto,
  EmbeddedSignupResult,
  WhatsAppSignupInviteDto,
  WhatsAppSignupSessionDto,
} from "@spa/shared";
import type { Prisma, WhatsAppSignupSession } from "@spa/db";
import {
  exchangeCodeForBusinessToken,
  fetchPhoneNumberDetails,
  fetchSubscriptionStatus,
  generateRegistrationPin,
  getEmbeddedSignupPublicConfig,
  isEmbeddedSignupConfigured,
  registerPhoneNumber,
  subscribeAppToWaba,
} from "../integrations/whatsapp/embedded-signup.js";
import {
  generateSignupToken,
  hashSignupToken,
  whatsAppSignupSessionRepository,
} from "../repositories/whatsAppSignupSession.repository.js";
import { whatsAppAccountRepository } from "../repositories/whatsAppAccount.repository.js";
import { adminBusinessRepository } from "../repositories/adminBusiness.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import { NotFoundError, ValidationError } from "../errors/index.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { toWhatsAppAccountDto } from "./admin-whatsapp.service.js";

/**
 * Embedded Signup de WhatsApp (docs/PANEL-OPERADOR.md §7.4).
 *
 * Es la puerta por la que el número del cliente entra **sin** que el operador
 * copie identificadores a mano (§7.3): el cliente hace un login con Facebook y
 * este servicio hace el resto contra la Graph API.
 *
 * Hay dos formas de llegar al mismo `completeEmbeddedSignup`:
 *
 * - **Enlace de auto-conexión** (lo normal). El operador genera una URL de un
 *   solo uso y se la manda al cliente por WhatsApp; el cliente la abre y hace
 *   el login con **su** cuenta de Facebook. Es lo que exige D2: la WABA y la
 *   tarjeta son del cliente, así que el operador no puede hacerlo por él.
 * - **Botón en el panel**, para cuando el operador está con el cliente (o
 *   compartiendo pantalla) y prefiere no mandar nada.
 *
 * El resultado en ambos casos es una fila de `whatsapp_accounts` idéntica a la
 * del alta manual, así que todo lo que ya funciona —`resolveWhatsAppProviderForBusiness`,
 * el webhook multi-WABA, el checklist de onboarding— sigue funcionando sin cambios.
 */

function toSessionDto(
  row: WhatsAppSignupSession,
  options: { url?: string | null } = {},
): WhatsAppSignupSessionDto {
  return {
    id: row.id,
    businessId: row.businessId,
    status: isExpired(row) ? "EXPIRED" : row.status,
    expiresAt: row.expiresAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    phoneNumberId: row.phoneNumberId,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    url: options.url ?? null,
  };
}

/**
 * El vencimiento se calcula al leer en vez de con un job que barra la tabla: un
 * enlace vencido no tiene ningún efecto colateral, así que no hay nada que
 * limpiar a tiempo. La fila se marca `EXPIRED` recién cuando alguien la usa.
 */
function isExpired(row: WhatsAppSignupSession): boolean {
  return row.status === "PENDING" && row.expiresAt.getTime() <= Date.now();
}

function signupUrl(token: string): string {
  return `${env.APP_URL.replace(/\/$/, "")}/conectar/${token}`;
}

export function getEmbeddedSignupConfig(): EmbeddedSignupConfigDto {
  const config = getEmbeddedSignupPublicConfig();
  return {
    enabled: config !== null,
    appId: config?.appId ?? null,
    configId: config?.configId ?? null,
    graphVersion: config?.graphVersion ?? null,
  };
}

async function requireBusinessName(businessId: string): Promise<string> {
  const business = await adminBusinessRepository.findDetail(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }
  return business.name;
}

// ── Enlaces de auto-conexión ────────────────────────────────────────────────

/**
 * Genera el enlace que el operador le manda al cliente. El token en claro se
 * devuelve **una sola vez**: en la base solo queda su SHA-256, así que si el
 * operador pierde el enlace tiene que generar otro (y eso está bien — es lo
 * mismo que hace cualquier enlace de invitación).
 *
 * Generar uno nuevo revoca los pendientes: en un hilo de WhatsApp con varios
 * enlaces, el cliente casi seguro abre el que no toca.
 */
export async function createSignupLink(
  businessId: string,
  actor: string,
): Promise<WhatsAppSignupSessionDto> {
  if (!isEmbeddedSignupConfigured()) {
    throw new ValidationError(
      "El Embedded Signup no está habilitado en este despliegue todavía (falta la app de " +
        "Meta aprobada, §7.1). Mientras tanto conecta el número a mano.",
    );
  }
  await requireBusinessName(businessId);

  await whatsAppSignupSessionRepository.revokePending(businessId);

  const token = generateSignupToken();
  const expiresAt = new Date(Date.now() + env.WHATSAPP_SIGNUP_LINK_TTL_HOURS * 3_600_000);
  const row = await whatsAppSignupSessionRepository.create({
    businessId,
    tokenHash: hashSignupToken(token),
    expiresAt,
    createdBy: actor,
  });

  await auditLogRepository.record({
    actor,
    action: "whatsapp.signup_link.create",
    businessId,
    after: { sessionId: row.id, expiresAt: expiresAt.toISOString() },
  });
  logger.info({ actor, businessId, sessionId: row.id }, "whatsapp_signup_link_created");

  return toSessionDto(row, { url: signupUrl(token) });
}

export async function listSignupLinks(businessId: string): Promise<WhatsAppSignupSessionDto[]> {
  await requireBusinessName(businessId);
  const rows = await whatsAppSignupSessionRepository.listByBusiness(businessId);
  return rows.map((row) => toSessionDto(row));
}

export async function revokeSignupLink(
  businessId: string,
  sessionId: string,
  actor: string,
): Promise<void> {
  const row = await whatsAppSignupSessionRepository.find(sessionId);
  if (!row || row.businessId !== businessId) {
    throw new NotFoundError("Enlace de conexión no encontrado para este negocio.");
  }
  if (row.status !== "PENDING") {
    return;
  }

  await whatsAppSignupSessionRepository.update(sessionId, { status: "REVOKED" });
  await auditLogRepository.record({
    actor,
    action: "whatsapp.signup_link.revoke",
    businessId,
    before: { sessionId, expiresAt: row.expiresAt.toISOString() },
  });
  logger.info({ actor, businessId, sessionId }, "whatsapp_signup_link_revoked");
}

/**
 * Portada del enlace, para el cliente que lo abre. Devuelve deliberadamente
 * poco: el nombre del negocio (para que sepa que llegó al lugar correcto) y si
 * el enlace sirve. Nunca revela nada del operador ni de otros negocios.
 *
 * Un token que no existe se responde igual que uno vencido —`NotFoundError`—
 * para no volver este endpoint un oráculo de tokens válidos.
 */
export async function getSignupInvite(token: string): Promise<WhatsAppSignupInviteDto> {
  const row = await whatsAppSignupSessionRepository.findByToken(token);
  if (!row) {
    throw new NotFoundError("Este enlace no existe o ya no está disponible.");
  }

  const expired = isExpired(row);
  if (expired) {
    await whatsAppSignupSessionRepository.update(row.id, { status: "EXPIRED" });
  }

  const status = expired ? "EXPIRED" : row.status;
  const unavailableReason =
    status === "COMPLETED"
      ? "Este número ya quedó conectado. No hace falta hacer nada más."
      : status === "EXPIRED"
        ? "El enlace venció. Pídele uno nuevo a quien te lo envió."
        : status === "REVOKED"
          ? "El enlace fue cancelado. Pídele uno nuevo a quien te lo envió."
          : null;

  return {
    businessName: row.business.name,
    status,
    expiresAt: row.expiresAt.toISOString(),
    unavailableReason,
    config: getEmbeddedSignupConfig(),
  };
}

/**
 * Completa el signup desde el enlace público. El "actor" del audit log no es un
 * operador sino el propio enlace: queda registrado quién lo generó y cuándo se
 * usó, que es la trazabilidad que importa acá.
 */
export async function completeSignupFromInvite(
  token: string,
  input: EmbeddedSignupCallbackInput,
): Promise<EmbeddedSignupResult> {
  const row = await whatsAppSignupSessionRepository.findByToken(token);
  if (!row) {
    throw new NotFoundError("Este enlace no existe o ya no está disponible.");
  }
  if (isExpired(row)) {
    await whatsAppSignupSessionRepository.update(row.id, { status: "EXPIRED" });
    throw new ValidationError("El enlace venció. Pídele uno nuevo a quien te lo envió.");
  }
  if (row.status !== "PENDING") {
    throw new ValidationError("Este enlace ya se usó o fue cancelado.");
  }

  try {
    const result = await completeEmbeddedSignup(row.businessId, input, `signup_link:${row.id}`);

    await whatsAppSignupSessionRepository.update(row.id, {
      status: "COMPLETED",
      completedAt: new Date(),
      accountId: result.account.id,
      wabaId: result.account.wabaId,
      phoneNumberId: result.account.phoneNumberId,
      lastError: null,
    });

    return result;
  } catch (error) {
    // El enlace queda PENDING a propósito: casi todos los fallos de Meta
    // (número ya registrado con otro PIN, permisos que faltan) se arreglan y se
    // reintentan con el mismo enlace. Se guarda el motivo para que el operador
    // lo vea en el panel sin pedirle una captura al cliente.
    const message = error instanceof Error ? error.message : "Error desconocido.";
    await whatsAppSignupSessionRepository.update(row.id, { lastError: message.slice(0, 500) });
    throw error;
  }
}

// ── El flujo server-to-server ───────────────────────────────────────────────

/**
 * Convierte el `code` del popup de Facebook en un número listo para operar.
 *
 * El orden importa y no es intercambiable:
 *
 * 1. **Canjear** el code (es de un solo uso y de vida corta — si esto falla, no
 *    hay nada que deshacer).
 * 2. **Suscribir** la app a la WABA: sin esto el webhook nunca recibe nada, así
 *    que un fallo acá tiene que abortar el alta en vez de dejar una cuenta que
 *    "existe" pero está muda.
 * 3. **Registrar** el número en Cloud API con un PIN nuevo.
 * 4. **Leer** los datos del número y recién ahí escribir la fila.
 *
 * Guardar al final es deliberado: una fila en `whatsapp_accounts` significa
 * "este negocio puede mandar y recibir mensajes por acá", y hasta el paso 3 eso
 * no es cierto. Si algo falla, el negocio se queda como estaba (con el fallback
 * a las credenciales globales del operador) en vez de quedar a medio conectar.
 */
export async function completeEmbeddedSignup(
  businessId: string,
  input: EmbeddedSignupCallbackInput,
  actor: string,
): Promise<EmbeddedSignupResult> {
  await requireBusinessName(businessId);

  // Misma regla que el alta manual: el `phone_number_id` es la llave con la que
  // el webhook resuelve el tenant, así que robárselo a otro negocio le cortaría
  // las conversaciones en vivo.
  const existing = await whatsAppAccountRepository.findByPhoneNumberId(input.phoneNumberId);
  if (existing && existing.businessId !== businessId) {
    throw new ValidationError(
      "Ese número de WhatsApp ya está conectado a otro negocio. Desconéctalo de allí antes de reasignarlo.",
    );
  }

  const steps: { label: string; detail: string }[] = [];

  const accessToken = await exchangeCodeForBusinessToken(input.code);
  steps.push({ label: "Autorización", detail: "Meta entregó el token de la cuenta del cliente." });

  await subscribeAppToWaba(input.wabaId, accessToken);
  steps.push({ label: "Webhooks", detail: "La app quedó suscrita a los mensajes de esta WABA." });

  const pin = generateRegistrationPin();
  const registration = await registerPhoneNumber(input.phoneNumberId, pin, accessToken);
  steps.push({ label: "Cloud API", detail: registration.detail });

  const details = await fetchPhoneNumberDetails(input.phoneNumberId, accessToken);
  const subscriptionStatus = await fetchSubscriptionStatus(input.wabaId, accessToken);

  const row = await whatsAppAccountRepository.connect(businessId, {
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId,
    displayPhoneNumber: details.displayPhoneNumber,
    displayName: details.verifiedName,
    accessToken,
    onboardingSource: "EMBEDDED_SIGNUP",
    businessPortfolioId: input.businessPortfolioId || null,
    registrationPin: pin,
    registeredAt: registration.registered ? new Date() : null,
    subscriptionStatus,
    qualityRating: details.qualityRating,
    messagingLimit: details.messagingLimit,
  });

  steps.push({
    label: "Listo",
    detail: `${details.displayPhoneNumber ?? "El número"} quedó conectado a este negocio.`,
  });

  // Cualquier otro enlace pendiente sobra: el negocio ya tiene su número.
  await whatsAppSignupSessionRepository.revokePending(businessId);

  const account = toWhatsAppAccountDto(row);
  await auditLogRepository.record({
    actor,
    action: "whatsapp.account.embedded_signup",
    businessId,
    after: {
      ...account,
      accessTokenMask: undefined,
    } as unknown as Prisma.InputJsonValue,
  });
  logger.info(
    { actor, businessId, phoneNumberId: input.phoneNumberId, wabaId: input.wabaId },
    "whatsapp_embedded_signup_completed",
  );

  return { account, steps };
}
