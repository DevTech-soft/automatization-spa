import type { Prisma, PrismaClient } from "@spa/db";
import { prisma } from "../db/prisma.js";

type Db = PrismaClient | Prisma.TransactionClient;

export const customerRepository = {
  /** Evita duplicar clientes del mismo negocio por teléfono (sección 6). */
  upsertByPhone(
    businessId: string,
    phone: string,
    data: { name: string; email?: string | undefined },
    db: Db = prisma,
  ) {
    return db.customer.upsert({
      where: { businessId_phone: { businessId, phone } },
      create: { businessId, phone, name: data.name, email: data.email },
      update: { name: data.name, email: data.email },
    });
  },

  findById(id: string, db: Db = prisma) {
    return db.customer.findUnique({ where: { id } });
  },

  /** Usado por la sincronización a Google Sheets (Fase 7) — columnas "Última reserva"/"Número de reservas". */
  async getAppointmentStats(
    customerId: string,
    db: Db = prisma,
  ): Promise<{ totalAppointments: number; lastAppointmentDate: Date | null }> {
    const [totalAppointments, lastAppointment] = await Promise.all([
      db.appointment.count({ where: { customerId } }),
      db.appointment.findFirst({
        where: { customerId },
        orderBy: { appointmentDate: "desc" },
        select: { appointmentDate: true },
      }),
    ]);
    return { totalAppointments, lastAppointmentDate: lastAppointment?.appointmentDate ?? null };
  },
};
