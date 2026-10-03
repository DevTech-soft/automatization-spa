import type { FastifyReply, FastifyRequest } from "fastify";
import type { PortalRole } from "@spa/shared";
import { PORTAL_ROLES } from "@spa/shared";
import { ForbiddenError } from "../errors/index.js";
import { portalUserRepository } from "../repositories/portalUser.repository.js";
import { requireSession } from "./admin-auth.js";

function toPortalRole(role: string): PortalRole {
  // `admin` (rol incorporado de Better Auth que no usamos) se trata como dueño;
  // cualquier otra cosa, como equipo: ante la duda, menos permisos.
  if (role === "owner" || role === "admin") {
    return "owner";
  }
  return PORTAL_ROLES.includes(role as PortalRole) ? (role as PortalRole) : "member";
}

/**
 * Guard de `/portal/*` (docs/PANEL-OPERADOR.md F7). El tenant sale de la
 * membresía del usuario —nunca de la URL ni del body—, así que ningún endpoint
 * del portal recibe un `businessId` que un cliente pueda cambiar.
 *
 * Si el usuario pertenece a más de un negocio, manda la organización activa de
 * la sesión; si no hay o no coincide, la primera membresía.
 *
 * Un negocio `SUSPENDED` sigue entrando (ve su data y el aviso de mora: es lo que
 * lo hace escribirle al operador, §5). `CANCELLED` o desactivado, no.
 */
export async function requirePortalSession(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const session = await requireSession(request);
  const user = session.user as typeof session.user & { role?: string | null };

  if (user.role !== "client") {
    throw new ForbiddenError("El portal es para los usuarios de cada negocio.");
  }

  const memberships = await portalUserRepository.findMemberships(user.id);
  const activeOrganizationId =
    (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
  const membership =
    memberships.find((m) => m.organizationId === activeOrganizationId && m.organization.business) ??
    memberships.find((m) => m.organization.business);
  const business = membership?.organization.business;

  if (!membership || !business) {
    throw new ForbiddenError("Tu usuario no está asociado a ningún negocio.");
  }
  if (business.status === "CANCELLED" || !business.active) {
    throw new ForbiddenError("Este negocio ya no tiene el servicio activo.");
  }

  request.portal = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: toPortalRole(membership.role),
    businessId: business.id,
    business,
  };
}

/** Para colgar después de `requirePortalSession` en lo que el equipo no ve (dinero, métricas). */
export async function requirePortalOwner(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (request.portal?.role !== "owner") {
    throw new ForbiddenError("Solo el dueño(a) del negocio puede ver esta sección.");
  }
}
