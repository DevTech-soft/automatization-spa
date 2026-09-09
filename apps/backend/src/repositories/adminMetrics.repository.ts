import type { BusinessStatus, Prisma } from "@spa/db";
import { prisma } from "../db/prisma.js";

/**
 * Agregados para los dashboards del panel (docs/PANEL-OPERADOR.md §1, F3e/F6).
 *
 * Todo lo que se puede contar en Postgres se cuenta en Postgres: el panel pinta
 * números, no recorre filas. Las series diarias salen de un `$queryRaw` porque
 * Prisma no sabe agrupar por día de una columna `date`.
 */

export interface StatusCount {
  status: BusinessStatus;
  count: number;
}

export interface DailyPoint {
  date: string;
  appointments: number;
  revenue: number;
}

export interface ServiceUsage {
  serviceId: string;
  name: string;
  appointments: number;
  revenue: number;
}

/** Estados de pago que significan "el negocio recibió plata". */
const COLLECTED_PAYMENT_STATUSES = ["PAID", "DEPOSIT_PAID"] as const;

export const adminMetricsRepository = {
  async countBusinessesByStatus(): Promise<StatusCount[]> {
    const rows = await prisma.business.groupBy({ by: ["status"], _count: { _all: true } });
    return rows.map((row) => ({ status: row.status, count: row._count._all }));
  },

  countBusinessesCreatedSince(from: Date): Promise<number> {
    return prisma.business.count({ where: { createdAt: { gte: from } } });
  },

  // ── Consumo agregado de todos los clientes ────────────────────────────────

  countAppointmentsSince(from: Date, businessId?: string): Promise<number> {
    return prisma.appointment.count({
      where: { createdAt: { gte: from }, ...(businessId ? { businessId } : {}) },
    });
  },

  countConversationsSince(from: Date, businessId?: string): Promise<number> {
    return prisma.whatsAppConversation.count({
      where: { updatedAt: { gte: from }, ...(businessId ? { businessId } : {}) },
    });
  },

  countGiftCardsSince(from: Date, businessId?: string): Promise<number> {
    return prisma.giftCard.count({
      where: { createdAt: { gte: from }, ...(businessId ? { businessId } : {}) },
    });
  },

  /** Volumen transaccionado por los clientes en Wompi (no es ingreso del operador). */
  async sumCollectedSince(from: Date, businessId?: string): Promise<number> {
    const result = await prisma.payment.aggregate({
      where: {
        status: { in: [...COLLECTED_PAYMENT_STATUSES] },
        updatedAt: { gte: from },
        ...(businessId ? { businessId } : {}),
      },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  },

  // ── Consumo de un negocio ─────────────────────────────────────────────────

  async appointmentsByStatus(businessId: string, from: Date): Promise<Record<string, number>> {
    const rows = await prisma.appointment.groupBy({
      by: ["status"],
      where: { businessId, createdAt: { gte: from } },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
  },

  async appointmentsBySource(businessId: string, from: Date): Promise<Record<string, number>> {
    const rows = await prisma.appointment.groupBy({
      by: ["source"],
      where: { businessId, createdAt: { gte: from } },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((row) => [row.source, row._count._all]));
  },

  async paymentTotals(businessId: string, from: Date): Promise<{ gross: number; count: number }> {
    const result = await prisma.payment.aggregate({
      where: { businessId, status: { in: [...COLLECTED_PAYMENT_STATUSES] }, updatedAt: { gte: from } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return { gross: Number(result._sum.amount ?? 0), count: result._count._all };
  },

  async depositTotal(businessId: string, from: Date): Promise<number> {
    const result = await prisma.appointment.aggregate({
      where: { businessId, paymentStatus: "DEPOSIT_PAID", updatedAt: { gte: from } },
      _sum: { depositAmount: true },
    });
    return Number(result._sum.depositAmount ?? 0);
  },

  async conversationStats(
    businessId: string,
    from: Date,
  ): Promise<{ total: number; active: number; lastMessageAt: Date | null }> {
    const [total, active, last] = await prisma.$transaction([
      prisma.whatsAppConversation.count({ where: { businessId } }),
      prisma.whatsAppConversation.count({ where: { businessId, updatedAt: { gte: from } } }),
      prisma.whatsAppConversation.findFirst({
        where: { businessId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);
    return { total, active, lastMessageAt: last?.updatedAt ?? null };
  },

  async giftCardStats(
    businessId: string,
    from: Date,
  ): Promise<{ sold: number; redeemed: number; amount: number }> {
    const paidWhere: Prisma.GiftCardWhereInput = {
      businessId,
      createdAt: { gte: from },
      paymentStatus: { in: [...COLLECTED_PAYMENT_STATUSES] },
    };
    const [sold, redeemed, sum] = await prisma.$transaction([
      prisma.giftCard.count({ where: paidWhere }),
      prisma.giftCard.count({ where: { businessId, redeemedAt: { gte: from } } }),
      prisma.giftCard.aggregate({ where: paidWhere, _sum: { amount: true } }),
    ]);
    return { sold, redeemed, amount: Number(sum._sum.amount ?? 0) };
  },

  /**
   * Serie diaria de citas e ingreso del negocio. Un solo round-trip por
   * dimensión; las fechas vuelven ya formateadas como `YYYY-MM-DD` para que el
   * panel no tenga que reinterpretar zonas horarias.
   */
  async dailySeries(businessId: string, from: Date): Promise<DailyPoint[]> {
    const appointments = await prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT to_char(appointment_date, 'YYYY-MM-DD') AS day, count(*)::bigint AS count
      FROM appointments
      WHERE business_id = ${businessId}::uuid
        AND appointment_date >= ${from}
      GROUP BY day
      ORDER BY day
    `;
    const payments = await prisma.$queryRaw<{ day: string; total: string | null }[]>`
      SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, sum(amount)::text AS total
      FROM payments
      WHERE business_id = ${businessId}::uuid
        AND updated_at >= ${from}
        AND status IN ('PAID', 'DEPOSIT_PAID')
      GROUP BY day
      ORDER BY day
    `;

    const byDay = new Map<string, DailyPoint>();
    for (const row of appointments) {
      byDay.set(row.day, { date: row.day, appointments: Number(row.count), revenue: 0 });
    }
    for (const row of payments) {
      const point = byDay.get(row.day) ?? { date: row.day, appointments: 0, revenue: 0 };
      point.revenue = Number(row.total ?? 0);
      byDay.set(row.day, point);
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  },

  /** Servicios más reservados en la ventana, con lo facturado por cada uno. */
  async topServices(businessId: string, from: Date, limit = 5): Promise<ServiceUsage[]> {
    const rows = await prisma.appointment.groupBy({
      by: ["serviceId"],
      where: { businessId, createdAt: { gte: from }, status: { notIn: ["CANCELLED", "EXPIRED"] } },
      _count: { _all: true },
      _sum: { price: true },
      orderBy: { _count: { serviceId: "desc" } },
      take: limit,
    });
    if (rows.length === 0) {
      return [];
    }

    const services = await prisma.service.findMany({
      where: { id: { in: rows.map((row) => row.serviceId) } },
      select: { id: true, name: true },
    });
    const names = new Map(services.map((service) => [service.id, service.name]));

    return rows.map((row) => ({
      serviceId: row.serviceId,
      name: names.get(row.serviceId) ?? "Servicio eliminado",
      appointments: row._count._all,
      revenue: Number(row._sum.price ?? 0),
    }));
  },
};
