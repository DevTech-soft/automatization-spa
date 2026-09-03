import "dotenv/config";
import { z } from "zod";

/**
 * Variables requeridas para arrancar el backend en esta fase. Las variables de
 * integraciones que aún no existen (WhatsApp, pagos, Google, storage) se validan
 * como opcionales aquí y se vuelven obligatorias cuando se implementa cada Fase
 * (ver docs/ARCHITECTURE.md), para no bloquear `npm run dev` antes de tiempo.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url(),
  APP_TIMEZONE: z.string().min(1).default("America/Bogota"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
  DIRECT_URL: z.string().min(1, "DIRECT_URL es requerida"),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  /**
   * Auth del panel de operador (Better Auth, docs/PANEL-OPERADOR.md §8/§9).
   * Better Auth se monta en este backend (`/api/auth/*`); el panel es cliente.
   * `BETTER_AUTH_SECRET`: 32+ chars, `openssl rand -base64 32`.
   * `BETTER_AUTH_URL`: URL pública del backend (para callbacks); si falta, usa APP_URL.
   * `PANEL_URL`: origen del panel (Vercel) — CORS + trustedOrigins de Better Auth.
   */
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET debe tener al menos 32 caracteres.").optional().or(z.literal("")),
  BETTER_AUTH_URL: z.string().url().optional().or(z.literal("")),
  PANEL_URL: z.string().url().optional().or(z.literal("")),

  WHATSAPP_ACCESS_TOKEN: z.string().optional().or(z.literal("")),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().or(z.literal("")),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().or(z.literal("")),
  /** Firma los webhooks de Meta. No está en la sección 38 del prompt maestro,
   *  se agregó en Fase 6 para validación de firma — ver docs/WHATSAPP.md. */
  WHATSAPP_APP_SECRET: z.string().optional().or(z.literal("")),

  PAYMENT_PROVIDER: z.enum(["wompi", "mercadopago"]).default("wompi"),
  PAYMENT_API_KEY: z.string().optional().or(z.literal("")),
  PAYMENT_PUBLIC_KEY: z.string().optional().or(z.literal("")),
  PAYMENT_INTEGRITY_SECRET: z.string().optional().or(z.literal("")),
  PAYMENT_WEBHOOK_SECRET: z.string().optional().or(z.literal("")),

  /**
   * La sección 38 del prompt maestro pide GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET
   * (OAuth), pero eso requiere un login manual para obtener un refresh token —
   * no encaja con un backend desatendido sin dashboard (sección 42). Se usa en
   * su lugar una Service Account (decisión de Fase 7, ver docs/GOOGLE-SHEETS.md).
   */
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional().or(z.literal("")),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional().or(z.literal("")),
  GOOGLE_SHEET_ID: z.string().optional().or(z.literal("")),

  STORAGE_BUCKET: z.string().default("gift-cards"),

  /**
   * Clave maestra para cifrar secretos por-tenant en reposo (tokens de WhatsApp,
   * llaves de Wompi) — docs/PANEL-OPERADOR.md §9. Base64 de 32 bytes:
   * `openssl rand -base64 32`. Opcional hasta que F2/F4 empiecen a guardar
   * credenciales por negocio; `encryptSecret` (utils/crypto.ts) lanza si se
   * intenta usar sin configurarla.
   */
  SECRETS_ENCRYPTION_KEY: z.string().optional().or(z.literal("")),

  STAFF_PIN: z.string().optional().or(z.literal("")),

  /** Protege los endpoints /internal/* (llamados por el scheduler in-process, ver Fase 3/9). */
  INTERNAL_JOBS_TOKEN: z.string().min(16, "INTERNAL_JOBS_TOKEN debe tener al menos 16 caracteres."),

  /**
   * Webhook del agente conversacional en n8n (ver docs/AGENTE-N8N.md). Si esta
   * variable está vacía, el canal de WhatsApp usa siempre el bot determinístico
   * de menús — el agente es opt-in por negocio vía `business.settings.agentEnabled`.
   * En Railway apunta a la red privada: http://n8n.railway.internal:5678/webhook/<id>
   */
  N8N_AGENT_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  /**
   * Secreto compartido con n8n. Viaja en `X-Agent-Token` en el reenvío hacia
   * n8n, y de vuelta como `Authorization: Bearer` en /internal/agent/*. Si no
   * se define, esas rutas caen a INTERNAL_JOBS_TOKEN.
   */
  N8N_AGENT_TOKEN: z.string().optional().or(z.literal("")),
  /** Presupuesto de espera del reenvío a n8n antes de caer al bot de menús. */
  N8N_AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("Variables de entorno inválidas:", parsed.error.flatten().fieldErrors);
    throw new Error("Configuración de entorno inválida. Revisa .env contra .env.example.");
  }

  return parsed.data;
}

export const env = loadEnv();
