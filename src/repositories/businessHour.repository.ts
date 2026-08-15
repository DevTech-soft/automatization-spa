import { prisma } from "../db/prisma.js";

export const businessHourRepository = {
  findForDay(businessId: string, dayOfWeek: number) {
    return prisma.businessHour.findFirst({
      where: { businessId, dayOfWeek, active: true },
    });
  },
};
