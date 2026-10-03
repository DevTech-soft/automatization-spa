import type {
  BusinessUserCredentials,
  BusinessUserDto,
  CreateBusinessUserInput,
  PortalRole,
  UpdateBusinessUserInput,
} from "@spa/shared";
import {
  createCredentialUser,
  generateTemporaryPassword,
  resetCredentialPassword,
} from "../auth/users.js";
import { ConflictError, NotFoundError } from "../errors/index.js";
import { adminBusinessRepository } from "../repositories/adminBusiness.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import { type BusinessMemberRow, portalUserRepository } from "../repositories/portalUser.repository.js";
import { logger } from "../utils/logger.js";

/**
 * Usuarios del portal de cada negocio, administrados por el operador
 * (docs/PANEL-OPERADOR.md F7). Sin infra de correo no hay invitaciones: el
 * operador crea la cuenta y le pasa al cliente la contraseña temporal que
 * devuelve esta capa, una sola vez.
 */

function toDto(row: BusinessMemberRow): BusinessUserDto {
  return {
    userId: row.user.id,
    memberId: row.id,
    name: row.user.name,
    email: row.user.email,
    role: row.role === "owner" ? "owner" : "member",
    twoFactorEnabled: Boolean(row.user.twoFactorEnabled),
    createdAt: row.user.createdAt.toISOString(),
    lastSeenAt: row.user.sessions[0]?.createdAt.toISOString() ?? null,
  };
}

async function requireOrganization(businessId: string): Promise<string> {
  const business = await adminBusinessRepository.findDetail(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }
  return portalUserRepository.ensureOrganization(business);
}

async function requireMember(businessId: string, userId: string): Promise<BusinessMemberRow> {
  const member = await portalUserRepository.findInBusiness(businessId, userId);
  if (!member) {
    throw new NotFoundError("Usuario no encontrado en este negocio.");
  }
  return member;
}

export async function listBusinessUsers(businessId: string): Promise<BusinessUserDto[]> {
  if (!(await adminBusinessRepository.findDetail(businessId))) {
    throw new NotFoundError("Negocio no encontrado.");
  }
  const rows = await portalUserRepository.listByBusiness(businessId);
  return rows.map(toDto);
}

export async function createBusinessUser(
  businessId: string,
  input: CreateBusinessUserInput,
  actor: string,
): Promise<BusinessUserCredentials> {
  const organizationId = await requireOrganization(businessId);

  if (await portalUserRepository.findUserByEmail(input.email)) {
    // Ni siquiera se reutiliza un `client` de otro negocio: compartir usuario
    // entre spas mezclaría tenants en una misma sesión.
    throw new ConflictError("Ya existe un usuario con ese correo.");
  }

  const temporaryPassword = generateTemporaryPassword();
  const user = await createCredentialUser({
    email: input.email,
    name: input.name,
    password: temporaryPassword,
    role: "client",
  });
  // Usuario y membresía no comparten transacción (el usuario lo escribe Better
  // Auth): si la membresía falla, se borra el usuario en vez de dejarlo huérfano.
  let member: BusinessMemberRow;
  try {
    member = await portalUserRepository.createMember(organizationId, user.id, input.role);
  } catch (error) {
    await portalUserRepository.deleteUser(user.id).catch((cleanupError: unknown) => {
      logger.error({ err: cleanupError, userId: user.id }, "portal_user_cleanup_failed");
    });
    throw error;
  }

  await auditLogRepository.record({
    actor,
    action: "business.user.create",
    businessId,
    after: { userId: user.id, email: user.email, role: input.role },
  });
  logger.info({ businessId, userId: user.id, role: input.role }, "portal_user_created");

  return { user: toDto(member), temporaryPassword };
}

export async function updateBusinessUser(
  businessId: string,
  userId: string,
  input: UpdateBusinessUserInput,
  actor: string,
): Promise<BusinessUserDto> {
  const member = await requireMember(businessId, userId);
  const before = member.role as PortalRole;
  const updated = await portalUserRepository.updateRole(member.id, input.role);

  await auditLogRepository.record({
    actor,
    action: "business.user.role",
    businessId,
    before: { userId, role: before },
    after: { userId, role: input.role },
  });

  return toDto(updated);
}

/** Genera una contraseña temporal nueva y cierra las sesiones abiertas del usuario. */
export async function resetBusinessUserPassword(
  businessId: string,
  userId: string,
  actor: string,
): Promise<BusinessUserCredentials> {
  const member = await requireMember(businessId, userId);
  const temporaryPassword = generateTemporaryPassword();
  await resetCredentialPassword(userId, temporaryPassword);

  await auditLogRepository.record({
    actor,
    action: "business.user.password_reset",
    businessId,
    metadata: { userId, email: member.user.email },
  });

  return { user: toDto(member), temporaryPassword };
}

/**
 * Recuperación de acceso: quita la verificación en dos pasos de un usuario que
 * perdió el teléfono y los códigos de respaldo. No hay otra salida sin correo;
 * el usuario la vuelve a activar desde su página de seguridad.
 */
export async function resetBusinessUserTwoFactor(
  businessId: string,
  userId: string,
  actor: string,
): Promise<BusinessUserDto> {
  const member = await requireMember(businessId, userId);
  await portalUserRepository.disableTwoFactor(userId);

  await auditLogRepository.record({
    actor,
    action: "business.user.2fa_reset",
    businessId,
    before: { twoFactorEnabled: Boolean(member.user.twoFactorEnabled) },
    metadata: { userId, email: member.user.email },
  });

  return toDto({ ...member, user: { ...member.user, twoFactorEnabled: false, sessions: [] } });
}

export async function removeBusinessUser(businessId: string, userId: string, actor: string): Promise<void> {
  const member = await requireMember(businessId, userId);
  const { userDeleted } = await portalUserRepository.removeMember(member.id, userId);

  await auditLogRepository.record({
    actor,
    action: "business.user.remove",
    businessId,
    before: { userId, email: member.user.email, role: member.role },
    metadata: { userDeleted },
  });
}
