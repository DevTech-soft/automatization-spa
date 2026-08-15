import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { dateOnlyToUTCDate } from "../utils/datetime.js";

/** Acepta el cliente global de Prisma o un cliente de transacción (`tx`). */
type Db = PrismaClient | Prisma.TransactionClient;

export const appointmentRepository = {
  /**
   * Citas que bloquean un slot: CONFIRMED, o PENDING todavía no expiradas.
   * CANCELLED y EXPIRED nunca bloquean disponibilidad.
   */
  findBlocking(businessId: string, serviceId: string, date: string, db: Db = prisma) {
    return db.appointment.findMany({
      where: {
        businessId,
        serviceId,
        appointmentDate: dateOnlyToUTCDate(date),
        OR: [{ status: "CONFIRMED" }, { status: "PENDING", expiresAt: { gt: new Date() } }],
      },
      select: { startTime: true, endTime: true },
    });
  },
};
