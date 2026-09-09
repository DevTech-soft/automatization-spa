import type { ClientContact, Prisma } from "@spa/db";
import { prisma } from "../db/prisma.js";

/**
 * Contactos del dueño de cada negocio (docs/PANEL-OPERADOR.md §4). Lado CRM del
 * panel: a quién llamar cuando hay mora o soporte. No confundir con `Customer`
 * (la clienta del spa).
 */
export const clientContactRepository = {
  listByBusiness(businessId: string): Promise<ClientContact[]> {
    return prisma.clientContact.findMany({
      where: { businessId },
      orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
    });
  },

  find(id: string): Promise<ClientContact | null> {
    return prisma.clientContact.findUnique({ where: { id } });
  },

  create(businessId: string, data: Omit<Prisma.ClientContactCreateInput, "business">): Promise<ClientContact> {
    return prisma.clientContact.create({ data: { ...data, business: { connect: { id: businessId } } } });
  },

  update(id: string, data: Prisma.ClientContactUpdateInput): Promise<ClientContact> {
    return prisma.clientContact.update({ where: { id }, data });
  },

  delete(id: string): Promise<ClientContact> {
    return prisma.clientContact.delete({ where: { id } });
  },
};
