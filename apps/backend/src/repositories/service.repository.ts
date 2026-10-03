import type { Prisma, Service } from "@spa/db";
import { prisma } from "../db/prisma.js";

export type ServiceWithUsage = Service & { _count: { appointments: number } };

export const serviceRepository = {
  findActiveByBusinessId(businessId: string) {
    return prisma.service.findMany({
      where: { businessId, active: true },
      orderBy: { name: "asc" },
    });
  },

  findActiveById(businessId: string, serviceId: string) {
    return prisma.service.findFirst({
      where: { id: serviceId, businessId, active: true },
    });
  },

  // — Panel de operador (catálogo, §6.1 paso 3): incluye los inactivos —

  listByBusiness(businessId: string): Promise<ServiceWithUsage[]> {
    return prisma.service.findMany({
      where: { businessId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { appointments: true } } },
    });
  },

  find(id: string): Promise<ServiceWithUsage | null> {
    return prisma.service.findUnique({
      where: { id },
      include: { _count: { select: { appointments: true } } },
    });
  },

  create(
    businessId: string,
    data: Omit<Prisma.ServiceCreateInput, "business">,
  ): Promise<ServiceWithUsage> {
    return prisma.service.create({
      data: { ...data, business: { connect: { id: businessId } } },
      include: { _count: { select: { appointments: true } } },
    });
  },

  update(id: string, data: Prisma.ServiceUpdateInput): Promise<ServiceWithUsage> {
    return prisma.service.update({
      where: { id },
      data,
      include: { _count: { select: { appointments: true } } },
    });
  },

  delete(id: string): Promise<Service> {
    return prisma.service.delete({ where: { id } });
  },
};
