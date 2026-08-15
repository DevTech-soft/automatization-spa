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

  N8N_WEBHOOK_BASE_URL: z.string().url().optional().or(z.literal("")),

  WHATSAPP_ACCESS_TOKEN: z.string().optional().or(z.literal("")),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().or(z.literal("")),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().or(z.literal("")),

  PAYMENT_PROVIDER: z.enum(["wompi", "mercadopago"]).default("wompi"),
  PAYMENT_API_KEY: z.string().optional().or(z.literal("")),
  PAYMENT_WEBHOOK_SECRET: z.string().optional().or(z.literal("")),

  GOOGLE_CLIENT_ID: z.string().optional().or(z.literal("")),
  GOOGLE_CLIENT_SECRET: z.string().optional().or(z.literal("")),
  GOOGLE_SHEET_ID: z.string().optional().or(z.literal("")),

  STORAGE_BUCKET: z.string().default("gift-cards"),

  STAFF_PIN: z.string().optional().or(z.literal("")),

  /** Protege los endpoints /internal/* (cron de n8n). Ver Fase 3. */
  INTERNAL_JOBS_TOKEN: z.string().min(16, "INTERNAL_JOBS_TOKEN debe tener al menos 16 caracteres."),
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
