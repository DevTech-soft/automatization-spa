import type {
  ExtendSubscriptionInput,
  SubscriptionPlanDto,
  UpsertSubscriptionInput,
} from "@spa/shared";
import { CYCLE_DAYS, DEFAULT_PLAN, TRIAL_DAYS } from "@spa/shared";
import type { Prisma, SubscriptionPlan } from "@spa/db";
import { subscriptionPlanRepository } from "../repositories/subscriptionPlan.repository.js";
import { adminBusinessRepository } from "../repositories/adminBusiness.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import { NotFoundError } from "../errors/index.js";
import { env } from "../config/env.js";
import {
  addCalendarDays,
  businessToday,
  dateOnlyFromUTCDate,
  dateOnlyToUTCDate,
  daysBetween,
} from "../utils/datetime.js";
import { toMoney } from "../utils/money.js";
import { logger } from "../utils/logger.js";

/**
 * Plan de suscripción de cada negocio (docs/PANEL-OPERADOR.md §6.5). Es el
 * cobro **del operador a su cliente**, no una membresía de las clientas del spa.
 *
 * La fecha que importa es `validUntil`: de ella salen los vencimientos del
 * dashboard, la emisión de cuentas de cobro y la auto-suspensión por mora
 * (`billing-cycle.service`). Todo el cálculo se hace en la zona del operador
 * (`APP_TIMEZONE`), no en la del negocio: la cartera es una sola.
 */

/** "Hoy" del operador, como fecha de calendario. */
export function operatorToday(): string {
  return businessToday(env.APP_TIMEZONE);
}

export function toSubscriptionDto(plan: SubscriptionPlan, today = operatorToday()): SubscriptionPlanDto {
  const validUntil = dateOnlyFromUTCDate(plan.validUntil);
  const daysRemaining = Math.round(daysBetween(today, validUntil));
  return {
    businessId: plan.businessId,
    name: plan.name,
    price: toMoney(plan.price),
    currency: plan.currency,
    cycle: plan.cycle,
    validUntil,
    graceDays: plan.graceDays,
    daysRemaining,
    expired: daysRemaining < 0,
    graceExpired: daysRemaining + plan.graceDays < 0,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

async function requireBusiness(businessId: string): Promise<{ id: string; name: string }> {
  const business = await adminBusinessRepository.findDetail(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }
  return { id: business.id, name: business.name };
}

/** `null` si el negocio todavía no tiene plan — el panel lo ofrece con los defaults. */
export async function getSubscription(businessId: string): Promise<SubscriptionPlanDto | null> {
  await requireBusiness(businessId);
  const plan = await subscriptionPlanRepository.findByBusinessId(businessId);
  return plan ? toSubscriptionDto(plan) : null;
}

/**
 * Valores sugeridos para un negocio sin plan: el plan mensual por defecto (D8)
 * con la vigencia arrancando en la prueba de 7 días desde hoy. El panel los usa
 * para prellenar el formulario; nada se persiste hasta que el operador guarda.
 */
export function suggestedSubscription(): UpsertSubscriptionInput {
  return {
    name: DEFAULT_PLAN.name,
    price: DEFAULT_PLAN.price,
    currency: DEFAULT_PLAN.currency,
    cycle: DEFAULT_PLAN.cycle,
    graceDays: DEFAULT_PLAN.graceDays,
    validUntil: addCalendarDays(operatorToday(), TRIAL_DAYS),
  };
}

export async function upsertSubscription(
  businessId: string,
  input: UpsertSubscriptionInput,
  actor: string,
): Promise<SubscriptionPlanDto> {
  await requireBusiness(businessId);
  const before = await subscriptionPlanRepository.findByBusinessId(businessId);

  const plan = await subscriptionPlanRepository.upsert(businessId, {
    name: input.name,
    price: input.price,
    currency: input.currency,
    cycle: input.cycle,
    validUntil: dateOnlyToUTCDate(input.validUntil),
    graceDays: input.graceDays,
  });
  const dto = toSubscriptionDto(plan);

  await auditLogRepository.record({
    actor,
    action: "business.subscription.upsert",
    businessId,
    before: before ? (toSubscriptionDto(before) as unknown as Prisma.InputJsonValue) : undefined,
    after: dto as unknown as Prisma.InputJsonValue,
  });
  logger.info({ actor, businessId, validUntil: dto.validUntil }, "admin_subscription_upserted");

  return dto;
}

/**
 * Corre `validUntil` sin registrar un pago — para cortesías y extensiones de
 * prueba. Un pago real va por `admin-billing.service`, que además salda cuentas
 * y reactiva el negocio.
 */
export async function extendSubscription(
  businessId: string,
  input: ExtendSubscriptionInput,
  actor: string,
): Promise<SubscriptionPlanDto> {
  await requireBusiness(businessId);
  const plan = await subscriptionPlanRepository.findByBusinessId(businessId);
  if (!plan) {
    throw new NotFoundError("El negocio todavía no tiene un plan. Créalo antes de extenderlo.");
  }

  const before = toSubscriptionDto(plan);
  // Se extiende desde hoy si ya venció: sumar sobre una fecha pasada regalaría
  // menos días de los que el operador cree estar dando.
  const base = before.expired ? operatorToday() : before.validUntil;
  const validUntil = addCalendarDays(base, input.days);

  const updated = await subscriptionPlanRepository.update(businessId, {
    validUntil: dateOnlyToUTCDate(validUntil),
  });
  const dto = toSubscriptionDto(updated);

  await auditLogRepository.record({
    actor,
    action: "business.subscription.extend",
    businessId,
    before: before as unknown as Prisma.InputJsonValue,
    after: { ...dto, reason: input.reason || null } as unknown as Prisma.InputJsonValue,
  });
  logger.info({ actor, businessId, days: input.days, validUntil }, "admin_subscription_extended");

  return dto;
}

/** Días con los que se extiende la vigencia al cobrar un ciclo completo. */
export function cycleDays(plan: SubscriptionPlan): number {
  return CYCLE_DAYS[plan.cycle];
}
