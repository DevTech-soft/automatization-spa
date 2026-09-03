import { prisma } from "../db/prisma.js";

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
};
