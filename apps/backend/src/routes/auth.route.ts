import type { FastifyInstance } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/better-auth.js";

/**
 * Monta Better Auth (`/api/auth/*`) sobre Fastify — ver docs/PANEL-OPERADOR.md §8.
 * Adapta la request de Fastify (ya con el body parseado por el parser de app.ts)
 * a la `Request` estándar que espera `auth.handler`, y devuelve la respuesta
 * cuidando los `Set-Cookie` múltiples (Headers.forEach los junta en uno solo).
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const url = new URL(request.url, `${request.protocol}://${request.host}`);
      const webRequest = new Request(url, {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        body:
          request.method !== "GET" && request.body != null
            ? JSON.stringify(request.body)
            : undefined,
      });

      const response = await auth.handler(webRequest);

      reply.status(response.status);
      const setCookies = response.headers.getSetCookie();
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "set-cookie") {
          reply.header(key, value);
        }
      });
      if (setCookies.length > 0) {
        reply.header("set-cookie", setCookies);
      }

      return reply.send(response.body ? await response.text() : null);
    },
  });
}
