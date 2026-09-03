import { randomUUID } from "node:crypto";
import type { Prisma } from "@spa/db";
import { prisma } from "../db/prisma.js";

/**
 * Consultas de negocios para el panel de operador (`/admin/businesses/*`).
 * Separado de `business.repository` (que es del runtime del bot/reservas) para
 * no mezclar concerns. Ninguna de estas filtra por tenant: en v1 el operador
 * ve todos los negocios (docs/PANEL-OPERADOR.md §8.5).
 */

const LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  chargeMode: true,
  active: true,
  createdAt: true,
} satisfies Prisma.BusinessSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  phone: true,
  whatsappNumber: true,
  email: true,
  address: true,
  timezone: true,
  currency: true,
  logoUrl: true,
  colorPrimary: true,
  colorSecondary: true,
  depositPercentage: true,
  updatedAt: true,
  organization: { select: { id: true } },
} satisfies Prisma.BusinessSelect;

export type AdminBusinessListRow = Prisma.BusinessGetPayload<{ select: typeof LIST_SELECT }>;
export type AdminBusinessDetailRow = Prisma.BusinessGetPayload<{ select: typeof DETAIL_SELECT }>;

interface ListParams {
  skip: number;
  take: number;
  q?: string | undefined;
  orderBy: Prisma.BusinessOrderByWithRelationInput;
}

export const adminBusinessRepository = {
  async list({ skip, take, q, orderBy }: ListParams): Promise<{ rows: AdminBusinessListRow[]; total: number }> {
    const where: Prisma.BusinessWhereInput = q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] }
      : {};

    const [rows, total] = await prisma.$transaction([
      prisma.business.findMany({ where, orderBy, skip, take, select: LIST_SELECT }),
      prisma.business.count({ where }),
    ]);
    return { rows, total };
  },

  findDetail(id: string): Promise<AdminBusinessDetailRow | null> {
    return prisma.business.findUnique({ where: { id }, select: DETAIL_SELECT });
  },

  findBySlug(slug: string) {
    return prisma.business.findUnique({ where: { slug }, select: { id: true } });
  },

  /** Crea el negocio + su `Organization` espejo (tenant, §8.5) en una transacción. */
  async createWithOrganization(
    data: Prisma.BusinessCreateInput,
  ): Promise<AdminBusinessDetailRow> {
    return prisma.$transaction(async (tx) => {
      const business = await tx.business.create({ data, select: { id: true, name: true, slug: true } });
      await tx.organization.create({
        data: {
          id: randomUUID(),
          name: business.name,
          slug: business.slug,
          createdAt: new Date(),
          businessId: business.id,
        },
      });
      return tx.business.findUniqueOrThrow({ where: { id: business.id }, select: DETAIL_SELECT });
    });
  },

  update(id: string, data: Prisma.BusinessUpdateInput): Promise<AdminBusinessDetailRow> {
    return prisma.business.update({ where: { id }, data, select: DETAIL_SELECT });
  },
};
