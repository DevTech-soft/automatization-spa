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

  create(data: Prisma.AppointmentUncheckedCreateInput, db: Db = prisma) {
    return db.appointment.create({
      data,
      include: { customer: true, service: true },
    });
  },

  findByCode(businessId: string, appointmentCode: string, db: Db = prisma) {
    return db.appointment.findUnique({
      where: { businessId_appointmentCode: { businessId, appointmentCode } },
      include: { customer: true, service: true },
    });
  },

  findById(id: string, db: Db = prisma) {
    return db.appointment.findUnique({ where: { id } });
  },

  setPaymentReference(id: string, paymentReference: string, db: Db = prisma) {
    return db.appointment.update({ where: { id }, data: { paymentReference } });
  },

  /**
   * Confirma la cita tras un pago validado, solo si sigue en un estado
   * "confirmable" (idempotente ante reprocesos). Puede lanzar el error del
   * trigger `check_appointment_capacity` si el slot ya no está disponible —
   * el llamador debe capturarlo (ver payment.service.ts).
   */
  async confirmIfPending(id: string, db: Db = prisma): Promise<boolean> {
    const result = await db.appointment.updateMany({
      where: { id, status: { in: ["PENDING", "EXPIRED"] } },
      data: { status: "CONFIRMED", paymentStatus: "PAID" },
    });
    return result.count > 0;
  },

  /** El pago se recibió pero la cita ya no pudo confirmarse (conflicto de capacity) — requiere revisión manual. */
  markPaymentConflict(id: string, note: string, db: Db = prisma) {
    return db.appointment.update({
      where: { id },
      data: { paymentStatus: "PAID", notes: note },
    });
  },

  /** Marca como EXPIRED las reservas PENDING cuyo expires_at ya pasó (sección 10). */
  async expireStalePending(now: Date, db: Db = prisma): Promise<number> {
    const result = await db.appointment.updateMany({
      where: { status: "PENDING", expiresAt: { lt: now } },
      data: { status: "EXPIRED", paymentStatus: "EXPIRED" },
    });
    return result.count;
  },
};
