import "fastify";
import type { PortalRole } from "@spa/shared";
import type { PortalBusinessRow } from "../repositories/portalUser.repository.js";

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
    /** Usuario de un spa resuelto por `requirePortalSession` (rutas `/portal/*`). */
    portal?: {
      userId: string;
      email: string;
      name: string;
      role: PortalRole;
      /** Tenant de la request, tomado de la membresía. Único `businessId` que usa `/portal/*`. */
      businessId: string;
      business: PortalBusinessRow;
    };
  }
}
