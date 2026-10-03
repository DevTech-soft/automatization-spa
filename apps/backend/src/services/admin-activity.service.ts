import type {
  ActivityQuery,
  AppointmentRow,
  ConversationRow,
  GiftCardRow,
  PaginatedResponse,
  PaginationQuery,
  PaymentRow,
} from "@spa/shared";
import { paginate } from "@spa/shared";
import type { Prisma } from "@spa/db";
import { adminActivityRepository } from "../repositories/adminActivity.repository.js";
import { adminBusinessRepository } from "../repositories/adminBusiness.repository.js";
import { NotFoundError } from "../errors/index.js";
import { dateOnlyFromUTCDate, dateOnlyToUTCDate } from "../utils/datetime.js";
import { toMoney, toMoneyOrNull } from "../utils/money.js";

/**
 * Actividad operativa de un negocio para el panel: citas, pagos,
 * conversaciones y gift cards (F3e/F6). Es la data de soporte del operador hoy,
 * y la del portal del cliente en F7 — de ahí que el filtro por `businessId` sea
 * obligatorio en todas: nunca hay un listado "de todos los negocios".
 */

function page(query: PaginationQuery) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

/** Rango de fechas de calendario → filtro Prisma sobre una columna `@db.Date`. */
function dateRange(filters: ActivityQuery): Prisma.DateTimeFilter | undefined {
  if (!filters.from && !filters.to) {
    return undefined;
  }
  return {
    ...(filters.from ? { gte: dateOnlyToUTCDate(filters.from) } : {}),
    ...(filters.to ? { lte: dateOnlyToUTCDate(filters.to) } : {}),
  };
}

async function requireBusiness(businessId: string): Promise<void> {
  const business = await adminBusinessRepository.findDetail(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }
}

export async function listAppointments(
  businessId: string,
  query: PaginationQuery,
  filters: ActivityQuery,
): Promise<PaginatedResponse<AppointmentRow>> {
  await requireBusiness(businessId);

  const range = dateRange(filters);
  const where: Prisma.AppointmentWhereInput = {
    businessId,
    ...(range ? { appointmentDate: range } : {}),
    ...(filters.status ? { status: filters.status as Prisma.AppointmentWhereInput["status"] } : {}),
    ...(query.q
      ? {
          OR: [
            { appointmentCode: { contains: query.q, mode: "insensitive" } },
            { customer: { name: { contains: query.q, mode: "insensitive" } } },
            { customer: { phone: { contains: query.q } } },
          ],
        }
      : {}),
  };

  const { rows, total } = await adminActivityRepository.listAppointments(where, page(query), query.order);

  const items: AppointmentRow[] = rows.map((row) => ({
    id: row.id,
    code: row.appointmentCode,
    date: dateOnlyFromUTCDate(row.appointmentDate),
    startTime: row.startTime,
    endTime: row.endTime,
    status: row.status,
    paymentStatus: row.paymentStatus,
    source: row.source,
    serviceName: row.service.name,
    customerName: row.customer.name,
    customerPhone: row.customer.phone,
    price: toMoney(row.price),
    depositAmount: toMoneyOrNull(row.depositAmount),
    pendingBalance: toMoneyOrNull(row.pendingBalance),
    createdAt: row.createdAt.toISOString(),
  }));

  return paginate(items, total, query);
}

export async function listPayments(
  businessId: string,
  query: PaginationQuery,
  filters: ActivityQuery,
): Promise<PaginatedResponse<PaymentRow>> {
  await requireBusiness(businessId);

  const where: Prisma.PaymentWhereInput = {
    businessId,
    ...(filters.status ? { status: filters.status as Prisma.PaymentWhereInput["status"] } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: dateOnlyToUTCDate(filters.from) } : {}),
            ...(filters.to ? { lte: dateOnlyToUTCDate(filters.to) } : {}),
          },
        }
      : {}),
    ...(query.q ? { reference: { contains: query.q, mode: "insensitive" } } : {}),
  };

  const { rows, total } = await adminActivityRepository.listPayments(where, page(query));

  const items: PaymentRow[] = rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    entityType: row.entityType,
    status: row.status,
    amount: toMoney(row.amount),
    currency: row.currency,
    provider: row.provider,
    transactionId: row.transactionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return paginate(items, total, query);
}

export async function listConversations(
  businessId: string,
  query: PaginationQuery,
  filters: ActivityQuery,
): Promise<PaginatedResponse<ConversationRow>> {
  await requireBusiness(businessId);

  const where: Prisma.WhatsAppConversationWhereInput = {
    businessId,
    ...(filters.status
      ? { state: filters.status as Prisma.WhatsAppConversationWhereInput["state"] }
      : {}),
    ...(query.q
      ? {
          OR: [
            { phone: { contains: query.q } },
            { customerName: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const { rows, total } = await adminActivityRepository.listConversations(where, page(query));

  const items: ConversationRow[] = rows.map((row) => ({
    id: row.id,
    phone: row.phone,
    customerName: row.customerName,
    state: row.state,
    serviceName: row.service?.name ?? null,
    date: row.date ? dateOnlyFromUTCDate(row.date) : null,
    startTime: row.startTime,
    appointmentId: row.appointmentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return paginate(items, total, query);
}

export async function listGiftCards(
  businessId: string,
  query: PaginationQuery,
  filters: ActivityQuery,
): Promise<PaginatedResponse<GiftCardRow>> {
  await requireBusiness(businessId);

  const where: Prisma.GiftCardWhereInput = {
    businessId,
    ...(filters.status ? { status: filters.status as Prisma.GiftCardWhereInput["status"] } : {}),
    ...(query.q
      ? {
          OR: [
            { code: { contains: query.q, mode: "insensitive" } },
            { buyerName: { contains: query.q, mode: "insensitive" } },
            { recipientName: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const { rows, total } = await adminActivityRepository.listGiftCards(where, page(query));

  const items: GiftCardRow[] = rows.map((row) => ({
    id: row.id,
    code: row.code,
    buyerName: row.buyerName,
    recipientName: row.recipientName,
    amount: toMoney(row.amount),
    status: row.status,
    paymentStatus: row.paymentStatus,
    createdAt: row.createdAt.toISOString(),
    redeemedAt: row.redeemedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  }));

  return paginate(items, total, query);
}
