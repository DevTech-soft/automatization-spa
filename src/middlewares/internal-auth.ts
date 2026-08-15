import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { UnauthorizedError } from "../errors/index.js";

/**
 * Protege los endpoints /internal/* (llamados por el cron de n8n, no
 * públicos). No es un sistema de auth real — un token compartido simple es
 * suficiente porque el único cliente esperado es n8n (sección 29).
 */
// Debe ser async: un preHandler de 2 argumentos que no devuelve una Promise
// nunca le indica a Fastify que terminó, y la request se queda colgada
// indefinidamente en el caso "éxito" (el caso "error" funciona igual porque
// el throw síncrono sí es capturado por Fastify).
export async function requireInternalToken(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token || token !== env.INTERNAL_JOBS_TOKEN) {
    throw new UnauthorizedError("Token interno inválido.");
  }
}
