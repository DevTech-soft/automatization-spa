import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** Body sin parsear, capturado en app.ts — necesario para validar `X-Hub-Signature-256` de Meta. */
    rawBody?: string;
  }
}
