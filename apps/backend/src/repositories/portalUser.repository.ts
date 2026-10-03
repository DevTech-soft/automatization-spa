import { randomUUID } from "node:crypto";
import type { Prisma } from "@spa/db";
import { prisma } from "../db/prisma.js";

/**
 * Membresías de los usuarios del portal (docs/PANEL-OPERADOR.md F7). Un usuario
 * `client` pertenece a la organización espejo de un negocio
 * (`organization.businessId`); de ahí sale su tenant. Las filas de `member` las
 * escribe solo el panel del operador — el plugin `organization` no deja a un
 * cliente crearse organizaciones (`allowUserToCreateOrganization: false`).
 */

const PORTAL_BUSINESS_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  active: true,
  timezone: true,
  currency: true,
  logoUrl: true,
  colorPrimary: true,
  colorSecondary: true,
} satisfies Prisma.BusinessSelect;

const MEMBERSHIP_INCLUDE = {
  organization: { select: { id: true, business: { select: PORTAL_BUSINESS_SELECT } } },
} satisfies Prisma.MemberInclude;

const MEMBER_WITH_USER_INCLUDE = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      twoFactorEnabled: true,
      createdAt: true,
      sessions: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  },
} satisfies Prisma.MemberInclude;

export type PortalMembershipRow = Prisma.MemberGetPayload<{ include: typeof MEMBERSHIP_INCLUDE }>;
export type PortalBusinessRow = Prisma.BusinessGetPayload<{ select: typeof PORTAL_BUSINESS_SELECT }>;
export type BusinessMemberRow = Prisma.MemberGetPayload<{ include: typeof MEMBER_WITH_USER_INCLUDE }>;

export const portalUserRepository = {
  /** Membresías del usuario con el negocio que espeja cada organización. */
  findMemberships(userId: string): Promise<PortalMembershipRow[]> {
    return prisma.member.findMany({
      where: { userId },
      include: MEMBERSHIP_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * Organización espejo del negocio. Los negocios creados antes del panel
   * (seed, `demo-spa`) no la tienen: se crea aquí, igual que
   * `createWithOrganization`, la primera vez que el operador les da usuarios.
   */
  async ensureOrganization(business: { id: string; name: string; slug: string }): Promise<string> {
    const existing = await prisma.organization.findUnique({ where: { businessId: business.id }, select: { id: true } });
    if (existing) {
      return existing.id;
    }
    const created = await prisma.organization.create({
      data: { id: randomUUID(), name: business.name, slug: business.slug, createdAt: new Date(), businessId: business.id },
      select: { id: true },
    });
    return created.id;
  },

  listByBusiness(businessId: string): Promise<BusinessMemberRow[]> {
    return prisma.member.findMany({
      where: { organization: { businessId } },
      include: MEMBER_WITH_USER_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
  },

  findInBusiness(businessId: string, userId: string): Promise<BusinessMemberRow | null> {
    return prisma.member.findFirst({
      where: { userId, organization: { businessId } },
      include: MEMBER_WITH_USER_INCLUDE,
    });
  },

  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true, role: true } });
  },

  createMember(organizationId: string, userId: string, role: string): Promise<BusinessMemberRow> {
    return prisma.member.create({
      data: { id: randomUUID(), organizationId, userId, role, createdAt: new Date() },
      include: MEMBER_WITH_USER_INCLUDE,
    });
  },

  updateRole(memberId: string, role: string): Promise<BusinessMemberRow> {
    return prisma.member.update({ where: { id: memberId }, data: { role }, include: MEMBER_WITH_USER_INCLUDE });
  },

  async deleteUser(userId: string): Promise<void> {
    await prisma.user.deleteMany({ where: { id: userId, role: "client" } });
  },

  /**
   * Quita la membresía y, si el usuario se queda sin ningún negocio, borra el
   * usuario (cascada a sesiones y cuentas): un `client` sin negocio no tiene nada
   * que ver y su contraseña no debería seguir sirviendo.
   */
  async removeMember(memberId: string, userId: string): Promise<{ userDeleted: boolean }> {
    return prisma.$transaction(async (tx) => {
      await tx.member.delete({ where: { id: memberId } });
      const remaining = await tx.member.count({ where: { userId } });
      if (remaining === 0) {
        await tx.user.deleteMany({ where: { id: userId, role: "client" } });
        return { userDeleted: true };
      }
      return { userDeleted: false };
    });
  },
};
