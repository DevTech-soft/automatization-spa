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

  request.log.error({ requestId, err: error }, "unhandled_error");
  reply.status(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message: "Ocurrió un error inesperado.",
      requestId,
    },
  });
}
