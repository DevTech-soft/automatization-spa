import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** Body sin parsear, capturado en app.ts — necesario para validar `X-Hub-Signature-256` de Meta. */
    rawBody?: string;
    /** Sesión del operador resuelta por `requireOperatorSession` (rutas `/admin/*`). */
    operator?: {
      userId: string;
      email: string;
      /** Organización activa de la sesión (tenant). En v1 el operador ve todos los negocios. */
      activeOrganizationId: string | null;
    };
  }
}
