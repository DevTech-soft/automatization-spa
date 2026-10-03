import type { FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/better-auth.js";
import { ForbiddenError, UnauthorizedError } from "../errors/index.js";

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** Sesión de Better Auth de la request (cookie o `Authorization: Bearer`), o 401. */
export async function requireSession(request: FastifyRequest): Promise<AuthSession> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) {
    throw new UnauthorizedError("Sesión no válida. Inicia sesión en el panel.");
  }
  return session;
}

/**
 * Guard de las rutas `/admin/*` (panel de operador). Valida la sesión de Better
 * Auth en CADA request (docs/PANEL-OPERADOR.md §9) — la sesión viaja como cookie
 * o como `Authorization: Bearer` (plugin `bearer`, patrón BFF del panel).
 *
 * Solo pasa `user.role = operator`, que ve todos los negocios. Un usuario de un
 * spa tiene sesión válida pero recibe 403: su superficie es `/portal/*`
 * (`portal-auth.ts`), filtrada por su negocio.
 */
export async function requireOperatorSession(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const session = await requireSession(request);

  if ((session.user as { role?: string | null }).role !== "operator") {
    throw new ForbiddenError("Esta sección es solo para el operador.");
  }

  request.operator = {
    userId: session.user.id,
    email: session.user.email,
    activeOrganizationId:
      (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
  };
}
