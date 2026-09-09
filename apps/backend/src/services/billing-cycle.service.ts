import type { BillingRunResult } from "@spa/shared";
import type { Prisma } from "@spa/db";
import { operatorBillingRepository } from "../repositories/operatorBilling.repository.js";
import { subscriptionPlanRepository } from "../repositories/subscriptionPlan.repository.js";
import { adminBusinessRepository } from "../repositories/adminBusiness.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import {
  addCalendarDays,
  dateOnlyFromUTCDate,
  dateOnlyToUTCDate,
  daysBetween,
} from "../utils/datetime.js";
import { logger } from "../utils/logger.js";
import { createInvoice } from "./admin-billing.service.js";
import { cycleDays, operatorToday } from "./admin-subscription.service.js";

/**
 * Ciclo de facturación diario (docs/PANEL-OPERADOR.md §6.4). Una corrida hace,
 * en este orden:
 *
 * 1. Emite la cuenta de cobro del próximo período, `LEAD_DAYS` antes de que
 *    venza la vigencia actual.
 * 2. Marca `OVERDUE` las cuentas enviadas cuya fecha de vencimiento ya pasó, y
 *    pone el negocio en `PAST_DUE`.
 * 3. Suspende los negocios cuya vigencia venció hace más de `graceDays`.
 *
 * Es **idempotente**: correrla dos veces el mismo día no duplica cuentas
 * (`findOverlapping`) ni reescribe estados que ya están donde deben. El actor de
 * todo lo que escribe es `system`, para distinguirlo en la bitácora de lo que
 * hace el operador a mano.
 *
 * Nunca toca `TRIAL` hacia `ACTIVE` ni `CANCELLED`: activar es una decisión de
 * onboarding, y un negocio cancelado ya no se factura. Un `TRIAL` vencido sí
 * cae a `PAST_DUE` — es el "día 7 sin conversión" de §6.5.
 */

const ACTOR = "system";

/** Días de anticipación con los que se emite la cuenta del próximo período. */
export const INVOICE_LEAD_DAYS = 5;

/** Estados que siguen dentro del ciclo de cobro. */
const BILLABLE_STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"] as const;

export async function runBillingCycle(today = operatorToday()): Promise<BillingRunResult> {
  const result: BillingRunResult = {
    runDate: today,
    invoicesCreated: 0,
    invoicesOverdue: 0,
    businessesPastDue: 0,
    businessesSuspended: 0,
    notes: [],
  };

  const plans = await subscriptionPlanRepository.listWithBusiness([...BILLABLE_STATUSES]);

  // Los planes se leen una sola vez, pero el estado del negocio cambia dentro de
  // la propia corrida (paso 2 mueve a `PAST_DUE`). Este mapa es el estado vigente
  // durante la corrida; leer `plan.business.status` en el paso 3 duplicaría
  // transiciones sobre un valor ya obsoleto.
  const statusNow = new Map(plans.map((plan) => [plan.businessId, plan.business.status]));

  // 1. Emisión anticipada.
  for (const plan of plans) {
    if (statusNow.get(plan.businessId) === "SUSPENDED") {
      // A un suspendido no se le sigue acumulando deuda: primero paga lo que debe.
      continue;
    }
    const validUntil = dateOnlyFromUTCDate(plan.validUntil);
    const daysLeft = Math.round(daysBetween(today, validUntil));
    if (daysLeft > INVOICE_LEAD_DAYS) {
      continue;
    }

    const existing = await operatorBillingRepository.findOverlapping(
      plan.businessId,
      dateOnlyToUTCDate(validUntil),
    );
    if (existing) {
      continue;
    }

    try {
      const invoice = await createInvoice(
        plan.businessId,
        { issuedAt: today, periodFrom: validUntil, periodTo: addCalendarDays(validUntil, cycleDays(plan)), send: true },
        ACTOR,
      );
      result.invoicesCreated += 1;
      result.notes.push(`${invoice.number} emitida a ${plan.business.name} (vence ${invoice.dueAt}).`);
    } catch (error) {
      logger.error({ businessId: plan.businessId, error }, "billing_cycle_invoice_failed");
      result.notes.push(`No se pudo emitir la cuenta de ${plan.business.name}.`);
    }
  }

  // 2. Vencimiento de cuentas enviadas + paso a mora.
  const due = await operatorBillingRepository.findDueForOverdue(dateOnlyToUTCDate(today));
  if (due.length > 0) {
    await operatorBillingRepository.markOverdue(due.map((invoice) => invoice.id));
    result.invoicesOverdue = due.length;

    for (const businessId of new Set(due.map((invoice) => invoice.businessId))) {
      const business = await adminBusinessRepository.findDetail(businessId);
      if (!business || (business.status !== "ACTIVE" && business.status !== "TRIAL")) {
        continue;
      }
      await adminBusinessRepository.updateStatus(businessId, "PAST_DUE");
      await recordStatusChange(businessId, business.status, "PAST_DUE", "cuenta de cobro vencida");
      statusNow.set(businessId, "PAST_DUE");
      result.businessesPastDue += 1;
      result.notes.push(`${business.name} pasó a mora.`);
    }
  }

  // 3. Suspensión al agotarse la gracia.
  for (const plan of plans) {
    const status = statusNow.get(plan.businessId);
    if (status !== "PAST_DUE" && status !== "TRIAL") {
      continue;
    }
    const validUntil = dateOnlyFromUTCDate(plan.validUntil);
    const daysPastGrace = Math.round(daysBetween(addCalendarDays(validUntil, plan.graceDays), today));
    if (daysPastGrace <= 0) {
      continue;
    }

    if (status === "TRIAL") {
      // Prueba vencida + gracia agotada: primero a mora, para que la suspensión
      // del día siguiente tenga una transición trazable y no un salto raro.
      await adminBusinessRepository.updateStatus(plan.businessId, "PAST_DUE");
      await recordStatusChange(plan.businessId, "TRIAL", "PAST_DUE", "prueba vencida");
      statusNow.set(plan.businessId, "PAST_DUE");
      result.businessesPastDue += 1;
      result.notes.push(`${plan.business.name} terminó la prueba sin convertir.`);
      continue;
    }

    await adminBusinessRepository.updateStatus(plan.businessId, "SUSPENDED");
    await recordStatusChange(
      plan.businessId,
      "PAST_DUE",
      "SUSPENDED",
      `${plan.graceDays} días de gracia agotados`,
    );
    statusNow.set(plan.businessId, "SUSPENDED");
    result.businessesSuspended += 1;
    result.notes.push(`${plan.business.name} suspendido por mora.`);
  }

  logger.info({ ...result, notes: result.notes.length }, "billing_cycle_completed");
  return result;
}

function recordStatusChange(
  businessId: string,
  from: string,
  to: string,
  reason: string,
): Promise<unknown> {
  return auditLogRepository.record({
    actor: ACTOR,
    action: "business.status.change",
    businessId,
    before: { status: from } as Prisma.InputJsonValue,
    after: { status: to, reason } as Prisma.InputJsonValue,
  });
}
