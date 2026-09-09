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
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

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
