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

  // Páginas legales para la revisión de la app de Meta (Facebook Login / WhatsApp
  // Embedded Signup). Deben cargar sin login ni redirección — ver docs/files/README.md.
  // URLs registradas en el App Dashboard:
  //   Política de privacidad          → /legal/privacidad
  //   Condiciones del servicio        → /legal/terminos
  //   Instrucciones de eliminación    → /legal/eliminacion-de-datos
  app.get("/legal/privacidad", (_request, reply) => reply.sendFile("legal/privacidad/index.html"));
  app.get("/legal/terminos", (_request, reply) => reply.sendFile("legal/terminos/index.html"));
  app.get("/legal/eliminacion-de-datos", (_request, reply) =>
    reply.sendFile("legal/eliminacion-de-datos/index.html"),
  );
}
