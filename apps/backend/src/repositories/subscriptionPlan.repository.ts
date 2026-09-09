import type { Prisma, SubscriptionPlan } from "@spa/db";
import { prisma } from "../db/prisma.js";

/**
 * Plan que cada negocio le paga al operador (docs/PANEL-OPERADOR.md §6.5).
 * 1 fila por negocio; `validUntil` es la fecha hasta la que el servicio está
 * pago y la que mueve toda la máquina de cartera (§6.4).
 */
export const subscriptionPlanRepository = {
  findByBusinessId(businessId: string): Promise<SubscriptionPlan | null> {
    return prisma.subscriptionPlan.findUnique({ where: { businessId } });
  },

  upsert(businessId: string, data: Omit<Prisma.SubscriptionPlanCreateInput, "business">): Promise<SubscriptionPlan> {
    return prisma.subscriptionPlan.upsert({
      where: { businessId },
      create: { ...data, business: { connect: { id: businessId } } },
      update: data,
    });
  },

  update(
    businessId: string,
    data: Prisma.SubscriptionPlanUpdateInput,
    db: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<SubscriptionPlan> {
    return db.subscriptionPlan.update({ where: { businessId }, data });
  },

  /**
   * Planes de todos los negocios que facturan, con su negocio. Lo consume el
   * dashboard de vencimientos y el job diario de facturación — son pocas filas
   * (decenas de clientes), así que no hace falta paginar.
   */
  listWithBusiness(statuses: Prisma.EnumBusinessStatusFilter["in"]) {
    return prisma.subscriptionPlan.findMany({
      where: { business: { status: { in: statuses } } },
      orderBy: { validUntil: "asc" },
      include: { business: { select: { id: true, name: true, slug: true, status: true } } },
    });
  },
};

export type SubscriptionPlanWithBusiness = Awaited<
  ReturnType<typeof subscriptionPlanRepository.listWithBusiness>
>[number];
