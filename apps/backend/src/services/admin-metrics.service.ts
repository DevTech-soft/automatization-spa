import type { BusinessStatus, BusinessUsage, OperatorOverview, RenewalRow } from "@spa/shared";
import { businessStatusValues } from "@spa/shared";
import { adminMetricsRepository } from "../repositories/adminMetrics.repository.js";
import { operatorBillingRepository } from "../repositories/operatorBilling.repository.js";
import { subscriptionPlanRepository } from "../repositories/subscriptionPlan.repository.js";
import { adminBusinessRepository } from "../repositories/adminBusiness.repository.js";
import { NotFoundError } from "../errors/index.js";
import {
  addCalendarDays,
  dateOnlyFromUTCDate,
  dateOnlyToUTCDate,
  daysBetween,
} from "../utils/datetime.js";
import { toMoney } from "../utils/money.js";
import { operatorToday } from "./admin-subscription.service.js";

/**
 * Dashboards del panel (docs/PANEL-OPERADOR.md §1, F3e/F6).
 *
 * Dos planos que deliberadamente NO se suman:
 * - **Cartera del operador**: MRR, cobrado, pendiente. Es su ingreso.
 * - **Consumo del cliente**: citas, conversaciones, volumen en Wompi. Es lo que
 *   justifica la mensualidad, pero esa plata va directo a la cuenta del spa
 *   (D3) y nunca pasa por el operador.
 */

/** Estados que facturan: el denominador real del MRR. */
const BILLABLE: BusinessStatus[] = ["ACTIVE", "PAST_DUE"];

function startOfMonth(today: string, monthsBack = 0): string {
  const [year, month] = today.split("-").map(Number);
  const target = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 - monthsBack, 1));
  return target.toISOString().slice(0, 10);
}

export async function getOverview(rangeDays = 30): Promise<OperatorOverview> {
  const today = operatorToday();
  const monthStart = startOfMonth(today);
  const lastMonthStart = startOfMonth(today, 1);
  const windowStart = addCalendarDays(today, -rangeDays);

  const [statusCounts, newThisMonth, plans, invoiceCounts, outstandingByBusiness] = await Promise.all([
    adminMetricsRepository.countBusinessesByStatus(),
    adminMetricsRepository.countBusinessesCreatedSince(dateOnlyToUTCDate(monthStart)),
    subscriptionPlanRepository.listWithBusiness([...businessStatusValues]),
    operatorBillingRepository.countInvoicesByStatus(),
    operatorBillingRepository.outstandingByBusiness(),
  ]);

  const byStatus = Object.fromEntries(businessStatusValues.map((status) => [status, 0])) as Record<
    BusinessStatus,
    number
  >;
  for (const row of statusCounts) {
    byStatus[row.status] = row.count;
  }

  const [collectedThisMonth, collectedLastMonth, outstanding, overdue, paidThisMonth] = await Promise.all([
    operatorBillingRepository.sumPayments({ paidAt: { gte: dateOnlyToUTCDate(monthStart) } }),
    operatorBillingRepository.sumPayments({
      paidAt: { gte: dateOnlyToUTCDate(lastMonthStart), lt: dateOnlyToUTCDate(monthStart) },
    }),
    operatorBillingRepository.sumInvoices({ status: { in: ["SENT", "OVERDUE"] } }),
    operatorBillingRepository.sumInvoices({ status: "OVERDUE" }),
    operatorBillingRepository.countPaidInvoicesSince(dateOnlyToUTCDate(monthStart)),
  ]);

  const [appointments, conversations, giftCards, grossVolume] = await Promise.all([
    adminMetricsRepository.countAppointmentsSince(dateOnlyToUTCDate(windowStart)),
    adminMetricsRepository.countConversationsSince(dateOnlyToUTCDate(windowStart)),
    adminMetricsRepository.countGiftCardsSince(dateOnlyToUTCDate(windowStart)),
    adminMetricsRepository.sumCollectedSince(dateOnlyToUTCDate(windowStart)),
  ]);

  const outstandingMap = new Map(
    outstandingByBusiness.map((row) => [row.businessId, toMoney(row._sum.total)]),
  );

  const billablePlans = plans.filter((plan) => BILLABLE.includes(plan.business.status));
  const mrr = billablePlans.reduce((sum, plan) => {
    const price = toMoney(plan.price);
    return sum + (plan.cycle === "ANNUAL" ? price / 12 : price);
  }, 0);

  const renewals: RenewalRow[] = plans
    .filter((plan) => plan.business.status !== "CANCELLED")
    .map((plan) => {
      const validUntil = dateOnlyFromUTCDate(plan.validUntil);
      return {
        businessId: plan.businessId,
        businessName: plan.business.name,
        status: plan.business.status,
        validUntil,
        daysRemaining: Math.round(daysBetween(today, validUntil)),
        graceDays: plan.graceDays,
        price: toMoney(plan.price),
        currency: plan.currency,
        outstanding: outstandingMap.get(plan.businessId) ?? 0,
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  const invoiceByStatus = Object.fromEntries(
    invoiceCounts.map((row) => [row.status, row._count._all]),
  ) as Record<string, number>;

  return {
    generatedAt: new Date().toISOString(),
    currency: billablePlans[0]?.currency ?? "COP",
    clients: {
      total: statusCounts.reduce((sum, row) => sum + row.count, 0),
      byStatus,
      billable: byStatus.ACTIVE + byStatus.PAST_DUE,
      newThisMonth,
    },
    revenue: {
      mrr: Math.round(mrr),
      collectedThisMonth,
      collectedLastMonth,
      outstanding,
      overdue,
    },
    invoices: {
      draft: invoiceByStatus.DRAFT ?? 0,
      sent: invoiceByStatus.SENT ?? 0,
      overdue: invoiceByStatus.OVERDUE ?? 0,
      paidThisMonth,
    },
    renewals,
    usage: { rangeDays, appointments, conversations, giftCards, grossVolume },
  };
}

/** Consumo de un cliente en una ventana de días (por defecto 30). */
export async function getBusinessUsage(businessId: string, rangeDays: number): Promise<BusinessUsage> {
  const business = await adminBusinessRepository.findDetail(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  const today = operatorToday();
  const from = addCalendarDays(today, -rangeDays);
  const fromDate = dateOnlyToUTCDate(from);

  const [byStatus, bySource, payments, deposits, conversations, giftCards, series, topServices] =
    await Promise.all([
      adminMetricsRepository.appointmentsByStatus(businessId, fromDate),
      adminMetricsRepository.appointmentsBySource(businessId, fromDate),
      adminMetricsRepository.paymentTotals(businessId, fromDate),
      adminMetricsRepository.depositTotal(businessId, fromDate),
      adminMetricsRepository.conversationStats(businessId, fromDate),
      adminMetricsRepository.giftCardStats(businessId, fromDate),
      adminMetricsRepository.dailySeries(businessId, fromDate),
      adminMetricsRepository.topServices(businessId, fromDate),
    ]);

  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

  return {
    businessId,
    rangeDays,
    from,
    to: today,
    currency: business.currency,
    appointments: {
      total,
      confirmed: byStatus.CONFIRMED ?? 0,
      pending: byStatus.PENDING ?? 0,
      cancelled: (byStatus.CANCELLED ?? 0) + (byStatus.EXPIRED ?? 0),
      completed: byStatus.COMPLETED ?? 0,
      noShow: byStatus.NO_SHOW ?? 0,
      bySource,
    },
    revenue: {
      grossVolume: payments.gross,
      deposits,
      paidCount: payments.count,
    },
    conversations: {
      active: conversations.active,
      total: conversations.total,
      lastMessageAt: conversations.lastMessageAt?.toISOString() ?? null,
    },
    giftCards,
    series,
    topServices,
  };
}
