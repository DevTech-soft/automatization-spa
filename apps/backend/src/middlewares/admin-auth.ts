import type { FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/better-auth.js";
import { UnauthorizedError } from "../errors/index.js";

/**
 * Guard de las rutas `/admin/*` (panel de operador). Valida la sesión de Better
 * Auth en CADA request (docs/PANEL-OPERADOR.md §9) — la sesión viaja como cookie
 * o como `Authorization: Bearer` (plugin `bearer`, patrón BFF del panel).
 *
 * v1: cualquier sesión válida es el operador y ve todos los negocios. En F7 este
 * guard filtra por `activeOrganizationId` según el rol del miembro.
 */
export async function requireOperatorSession(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });

  if (!session) {
    throw new UnauthorizedError("Sesión no válida. Inicia sesión en el panel.");
  }

  request.operator = {
    userId: session.user.id,
    email: session.user.email,
    activeOrganizationId:
      (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
  };
}
