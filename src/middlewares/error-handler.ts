import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../errors/index.js";

/**
 * Handler global de errores. Nunca devuelve stack traces al cliente
 * (sección 31 del prompt maestro) y siempre incluye request_id para trazabilidad.
 */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const requestId = request.id;

  if (error instanceof AppError) {
    request.log.warn({ requestId, code: error.code, details: error.details }, error.message);
    reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        requestId,
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    request.log.warn({ requestId, issues: error.issues }, "validation_error");
    reply.status(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos de entrada inválidos.",
        requestId,
      },
    });
    return;
  }

  // Errores 4xx que lanzan plugins de Fastify (@fastify/rate-limit con 429,
  // @fastify/static con 403 al intentar listar un directorio sin index, body
  // JSON malformado, etc.) no son AppError ni ZodError, pero traen su propio
  // statusCode. Sin este branch caían al 500 genérico de abajo: un cliente
  // rate-limited recibía "error interno" en vez de 429, y cada 403 de
  // @fastify/static se registraba como unhandled_error (ruido en el
  // monitoreo por tráfico esperado, no un bug real).
  const statusCode = "statusCode" in error ? error.statusCode : undefined;
  if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
    request.log.warn({ requestId, statusCode }, "client_error");
    reply.status(statusCode).send({
      error: {
        code: statusCode === 429 ? "TOO_MANY_REQUESTS" : "CLIENT_ERROR",
        message: statusCode === 429 ? "Demasiadas solicitudes, intenta de nuevo más tarde." : "Solicitud inválida.",
        requestId,
      },
    });
    return;
  }

  request.log.error({ requestId, err: error }, "unhandled_error");
  reply.status(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message: "Ocurrió un error inesperado.",
      requestId,
    },
  });
}
