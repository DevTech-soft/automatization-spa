import { z } from "zod";

/**
 * Integraciones por negocio que el panel administra: el número de WhatsApp
 * (docs/PANEL-OPERADOR.md §7) y las llaves de Wompi (§D3).
 *
 * Ninguna respuesta devuelve un secreto en claro: los tokens y llaves salen
 * enmascarados (`••••1234`). Guardar sí acepta el valor completo — es la única
 * dirección en la que el secreto viaja.
 */

// ── WhatsApp ────────────────────────────────────────────────────────────────

export interface WhatsAppAccountDto {
  id: string;
  businessId: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  displayName: string | null;
  /** Últimos 4 del token, nunca el token. */
  accessTokenMask: string;
  subscriptionStatus: string | null;
  qualityRating: string | null;
  messagingLimit: string | null;
  /** Cómo se dio de alta el número: a mano por el operador o por Embedded Signup. */
  onboardingSource: WhatsAppOnboardingSource;
  businessPortfolioId: string | null;
  /** `true` si Cloud API ya tiene el número registrado (§7.4, paso 3). */
  registered: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const whatsAppOnboardingSourceValues = ["MANUAL", "EMBEDDED_SIGNUP"] as const;
export type WhatsAppOnboardingSource = (typeof whatsAppOnboardingSourceValues)[number];

const metaId = z
  .string()
  .trim()
  .min(5, "El ID de Meta es más largo.")
  .max(40)
  .regex(/^\d+$/, "Los IDs de Meta son solo dígitos.");

/**
 * `POST /admin/businesses/:id/whatsapp` — conexión manual de un número
 * (el puente de §7.3, mientras Meta aprueba el Embedded Signup). Cuando F4
 * habilite el signup embebido, el callback rellena estos mismos campos sin
 * que el operador escriba nada.
 */
export const connectWhatsAppSchema = z.object({
  wabaId: metaId,
  phoneNumberId: metaId,
  displayPhoneNumber: z.string().trim().max(30).optional().or(z.literal("")),
  displayName: z.string().trim().max(120).optional().or(z.literal("")),
  accessToken: z.string().trim().min(20, "El token de Meta es más largo.").max(1000),
});

export type ConnectWhatsAppInput = z.infer<typeof connectWhatsAppSchema>;

/** `PATCH .../whatsapp/:accountId` — todo opcional; el token solo si se rota. */
export const updateWhatsAppSchema = z
  .object({
    displayPhoneNumber: z.string().trim().max(30).or(z.literal("")),
    displayName: z.string().trim().max(120).or(z.literal("")),
    accessToken: z.string().trim().min(20).max(1000),
    active: z.boolean(),
  })
  .partial();

export type UpdateWhatsAppInput = z.infer<typeof updateWhatsAppSchema>;

/** Diagnóstico de `POST .../whatsapp/:accountId/verify` contra la Graph API. */
export interface WhatsAppHealth {
  ok: boolean;
  /** Mensaje legible: qué respondió Meta. */
  detail: string;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  qualityRating?: string | null;
  messagingLimit?: string | null;
}

// ── WhatsApp · Embedded Signup (§7.4) ───────────────────────────────────────

/**
 * Lo que el browser necesita para abrir el popup de Facebook. Nada de esto es
 * secreto —el App ID es público por diseño y el config ID no da acceso a nada—,
 * pero cambia por despliegue, así que lo sirve el backend en vez de vivir en un
 * `NEXT_PUBLIC_*` del panel.
 *
 * `enabled: false` significa que el operador todavía no pasó el App Review de
 * Meta (§7.1): el panel oculta el botón y deja solo el alta manual.
 */
export interface EmbeddedSignupConfigDto {
  enabled: boolean;
  appId: string | null;
  configId: string | null;
  graphVersion: string | null;
}

/**
 * Los tres datos que devuelve el popup de Facebook al terminar. `code` es de un
 * solo uso y de vida corta: se canjea en el backend apenas llega.
 */
export const embeddedSignupCallbackSchema = z.object({
  code: z.string().trim().min(10, "El código de autorización de Meta es más largo.").max(2000),
  wabaId: metaId,
  phoneNumberId: metaId,
  /** El business portfolio del cliente; Meta lo manda pero no siempre. */
  businessPortfolioId: metaId.optional().or(z.literal("")),
});

export type EmbeddedSignupCallbackInput = z.infer<typeof embeddedSignupCallbackSchema>;

/** Resultado de un signup completado, para contarle al usuario qué pasó. */
export interface EmbeddedSignupResult {
  account: WhatsAppAccountDto;
  /** Traza legible de los pasos server-to-server (canje, suscripción, registro). */
  steps: { label: string; detail: string }[];
}

export const whatsAppSignupSessionStatusValues = [
  "PENDING",
  "COMPLETED",
  "REVOKED",
  "EXPIRED",
] as const;
export type WhatsAppSignupSessionStatus = (typeof whatsAppSignupSessionStatusValues)[number];

/** Un enlace de auto-conexión, tal como lo lista el panel. */
export interface WhatsAppSignupSessionDto {
  id: string;
  businessId: string;
  status: WhatsAppSignupSessionStatus;
  expiresAt: string;
  completedAt: string | null;
  phoneNumberId: string | null;
  lastError: string | null;
  createdAt: string;
  /**
   * La URL completa con el token — **solo** al crearlo. Al listar es `null`:
   * del token guardado solo queda el hash, así que no se puede reconstruir.
   */
  url: string | null;
}

/** Lo que ve el cliente al abrir el enlace, antes de darle a "conectar". */
export interface WhatsAppSignupInviteDto {
  businessName: string;
  status: WhatsAppSignupSessionStatus;
  expiresAt: string;
  /** Mensaje listo para mostrar cuando el enlace ya no sirve. */
  unavailableReason: string | null;
  config: EmbeddedSignupConfigDto;
}

// ── Wompi ───────────────────────────────────────────────────────────────────

export const paymentEnvironmentValues = ["TEST", "PROD"] as const;
export type PaymentEnvironment = (typeof paymentEnvironmentValues)[number];

export interface PaymentCredentialsDto {
  businessId: string;
  provider: string;
  environment: PaymentEnvironment;
  /** `null` si el negocio todavía cae al fallback de las env globales. */
  configuredAt: string | null;
  apiKeyMask: string;
  publicKeyMask: string;
  integritySecretMask: string;
  webhookSecretMask: string;
  /** `true` si no hay fila propia y los pagos usan las llaves globales del operador. */
  usingGlobalFallback: boolean;
}

const wompiKey = (label: string) => z.string().trim().min(10, `${label} parece incompleta.`).max(200);

export const upsertPaymentCredentialsSchema = z.object({
  environment: z.enum(paymentEnvironmentValues).default("PROD"),
  apiKey: wompiKey("La llave privada"),
  publicKey: wompiKey("La llave pública"),
  integritySecret: wompiKey("El secreto de integridad"),
  webhookSecret: wompiKey("El secreto de eventos"),
});

export type UpsertPaymentCredentialsInput = z.infer<typeof upsertPaymentCredentialsSchema>;
