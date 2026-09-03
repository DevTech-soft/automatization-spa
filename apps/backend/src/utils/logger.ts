import pino, { type LoggerOptions } from "pino";
import { env } from "../config/env.js";

/**
 * Opciones de logging compartidas. Se exponen (en vez de una instancia ya
 * construida) para que Fastify pueda crear su propio logger interno con la
 * misma configuración — pasarle una instancia de pino ya creada produce un
 * tipo de logger incompatible con `FastifyBaseLogger` bajo TS estricto.
 */
export const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "*.password",
      "*.token",
      "*.access_token",
      "*.WHATSAPP_ACCESS_TOKEN",
      "*.PAYMENT_API_KEY",
      "*.SUPABASE_SERVICE_ROLE_KEY",
      "*.raw_response.card",
    ],
    censor: "[REDACTED]",
  },
  ...(env.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } }
    : {}),
};

/** Instancia standalone para logs fuera del ciclo de vida de una request (boot, shutdown). */
export const logger = pino(loggerOptions);
