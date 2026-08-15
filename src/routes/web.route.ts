import type { FastifyInstance } from "fastify";

/**
 * Páginas del frontend vanilla (sección 3/40), servidas como estáticos por el
 * propio backend — un solo contenedor desplegable, sin CORS (ARCHITECTURE.md).
 * Los assets (`/css`, `/js`) los sirve el plugin `@fastify/static` registrado
 * en `app.ts`; aquí solo se exponen las URLs "limpias" de cada página.
 */
export async function webRoutes(app: FastifyInstance): Promise<void> {
  app.get("/reservar", (_request, reply) => reply.sendFile("reservar/index.html"));
  app.get("/gracias", (_request, reply) => reply.sendFile("gracias/index.html"));
  app.get("/regalar", (_request, reply) => reply.sendFile("regalar/index.html"));
  app.get("/validar", (_request, reply) => reply.sendFile("validar/index.html"));
}
