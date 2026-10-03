import type {
  CustomerDetail,
  CustomerRow,
  PaginatedResponse,
  PaginationQuery,
  PortalMeResponse,
} from "@spa/shared";
import { paginate } from "@spa/shared";
import type { Prisma } from "@spa/db";
import type { FastifyRequest } from "fastify";
import { NotFoundError } from "../errors/index.js";
import { type CustomerAggregate, portalCrmRepository } from "../repositories/portalCrm.repository.js";
import { dateOnlyFromUTCDate } from "../utils/datetime.js";
import { toMoney } from "../utils/money.js";

/**
 * Portal de cliente / CRM (docs/PANEL-OPERADOR.md F7). Lo que es propio del
 * portal; los listados de actividad y las métricas se reutilizan tal cual de
 * `admin-activity` / `admin-metrics`, que ya nacieron filtrados por negocio.
 */

type PortalContext = NonNullable<FastifyRequest["portal"]>;

export function getPortalMe(portal: PortalContext): PortalMeResponse {
  const { business } = portal;
  return {
    userId: portal.userId,
    email: portal.email,
    name: portal.name,
    role: portal.role,
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      status: business.status,
      timezone: business.timezone,
      currency: business.currency,
      logoUrl: business.logoUrl,
      colorPrimary: business.colorPrimary,
      colorSecondary: business.colorSecondary,
    },
  };
}

function toCustomerRow(
  row: { id: string; name: string; phone: string; email: string | null; createdAt: Date },
  aggregate: CustomerAggregate | undefined,
): CustomerRow {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    appointments: aggregate?.appointments ?? 0,
    completedAppointments: aggregate?.completedAppointments ?? 0,
    totalSpent: toMoney(aggregate?.totalSpent ?? 0),
    lastAppointmentDate: aggregate?.lastAppointmentDate ? dateOnlyFromUTCDate(aggregate.lastAppointmentDate) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listCustomers(
  businessId: string,
  query: PaginationQuery,
): Promise<PaginatedResponse<CustomerRow>> {
  const where: Prisma.CustomerWhereInput = {
    businessId,
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { phone: { contains: query.q } },
            { email: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const { rows, total } = await portalCrmRepository.listCustomers(where, {
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });
  const aggregates = await portalCrmRepository.aggregateByCustomer(
    businessId,
    rows.map((row) => row.id),
  );

  return paginate(
    rows.map((row) => toCustomerRow(row, aggregates.get(row.id))),
    total,
    query,
  );
}

export async function getCustomer(businessId: string, customerId: string): Promise<CustomerDetail> {
  const row = await portalCrmRepository.findCustomer(businessId, customerId);
  if (!row) {
    throw new NotFoundError("Clienta no encontrada.");
  }

  const aggregates = await portalCrmRepository.aggregateByCustomer(businessId, [row.id]);

  return {
    ...toCustomerRow(row, aggregates.get(row.id)),
    history: row.appointments.map((appointment) => ({
      id: appointment.id,
      code: appointment.appointmentCode,
      date: dateOnlyFromUTCDate(appointment.appointmentDate),
      startTime: appointment.startTime,
      serviceName: appointment.service.name,
      status: appointment.status,
      paymentStatus: appointment.paymentStatus,
      price: toMoney(appointment.price),
    })),
  };
}
