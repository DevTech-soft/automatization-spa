import type { BusinessHour } from "@spa/db";
import { prisma } from "../db/prisma.js";

export interface BusinessHourInput {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  active: boolean;
}

export const businessHourRepository = {
  findForDay(businessId: string, dayOfWeek: number) {
    return prisma.businessHour.findFirst({
      where: { businessId, dayOfWeek, active: true },
    });
  },

  listByBusiness(businessId: string): Promise<BusinessHour[]> {
    return prisma.businessHour.findMany({
      where: { businessId },
      orderBy: { dayOfWeek: "asc" },
    });
  },

  /**
   * Upsert por `(businessId, dayOfWeek)` en una sola transacción: la semana se
   * guarda entera o no se guarda. Un día cerrado conserva su fila con
   * `active: false` para no perder las horas al reabrirlo.
   */
  saveWeek(businessId: string, days: BusinessHourInput[]): Promise<BusinessHour[]> {
    return prisma.$transaction(
      days.map((day) =>
        prisma.businessHour.upsert({
          where: { businessId_dayOfWeek: { businessId, dayOfWeek: day.dayOfWeek } },
          create: { businessId, ...day },
          update: { openTime: day.openTime, closeTime: day.closeTime, active: day.active },
        }),
      ),
    );
  },
};
