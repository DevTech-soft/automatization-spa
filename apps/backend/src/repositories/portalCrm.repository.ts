import type { Prisma } from "@spa/db";
import { prisma } from "../db/prisma.js";

/**
 * Consultas del CRM del portal (docs/PANEL-OPERADOR.md F7): las clientas de un
 * spa con su historial. Todas reciben el `businessId` de la sesión y filtran
 * por él — también la búsqueda por id, para que un id de otro negocio responda
 * como inexistente.
 */

/** Estados que cuentan como cita que de verdad ocurrió (o va a ocurrir) y se cobró. */
const BILLED_STATUSES = ["CONFIRMED", "COMPLETED"] as const;

export interface CustomerAggregate {
  appointments: number;
  completedAppointments: number;
  totalSpent: Prisma.Decimal | null;
  lastAppointmentDate: Date | null;
}

export const portalCrmRepository = {
  async listCustomers(
    where: Prisma.CustomerWhereInput,
    { skip, take }: { skip: number; take: number },
  ) {
    const [rows, total] = await prisma.$transaction([
      prisma.customer.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take }),
      prisma.customer.count({ where }),
    ]);
    return { rows, total };
  },

  /** Agregados de citas por clienta, para una página de clientas. */
  async aggregateByCustomer(businessId: string, customerIds: string[]): Promise<Map<string, CustomerAggregate>> {
    const result = new Map<string, CustomerAggregate>();
    if (customerIds.length === 0) {
      return result;
    }
    const [all, billed] = await Promise.all([
      prisma.appointment.groupBy({
        by: ["customerId"],
        where: { businessId, customerId: { in: customerIds } },
        _count: { _all: true },
        _max: { appointmentDate: true },
      }),
      prisma.appointment.groupBy({
        by: ["customerId"],
        where: { businessId, customerId: { in: customerIds }, status: { in: [...BILLED_STATUSES] } },
        _count: { _all: true },
        _sum: { price: true },
      }),
    ]);
    for (const row of all) {
      result.set(row.customerId, {
        appointments: row._count._all,
        completedAppointments: 0,
        totalSpent: null,
        lastAppointmentDate: row._max.appointmentDate,
      });
    }
    for (const row of billed) {
      const entry = result.get(row.customerId);
      if (entry) {
        entry.completedAppointments = row._count._all;
        entry.totalSpent = row._sum.price;
      }
    }
    return result;
  },

  findCustomer(businessId: string, customerId: string) {
    return prisma.customer.findFirst({
      where: { id: customerId, businessId },
      include: {
        appointments: {
          orderBy: [{ appointmentDate: "desc" }, { startTime: "desc" }],
          take: 100,
          include: { service: { select: { name: true } } },
        },
      },
    });
  },
};
