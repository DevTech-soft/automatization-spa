import { z } from "zod";

/**
 * Plan que el negocio le paga al operador (docs/PANEL-OPERADOR.md §6.5, D8).
 * Defaults: mensual $50.000 COP / 30 días / 3 días de gracia.
 *
 * `validUntil` viaja como `YYYY-MM-DD`: es una columna `date` (sin hora), y
 * serializarla como ISO completo invita a bugs de zona horaria en el panel.
 */

export const subscriptionCycleValues = ["MONTHLY", "ANNUAL"] as const;
export type SubscriptionCycle = (typeof subscriptionCycleValues)[number];

/** Días que dura un ciclo. Es el paso con el que se extiende `validUntil` al cobrar. */
export const CYCLE_DAYS: Record<SubscriptionCycle, number> = { MONTHLY: 30, ANNUAL: 365 };

export const DEFAULT_PLAN = {
  name: "mensual",
  price: 50000,
  currency: "COP",
  cycle: "MONTHLY",
  graceDays: 3,
} as const;

/** Días de prueba de un negocio nuevo (§6.5). */
export const TRIAL_DAYS = 7;

export interface SubscriptionPlanDto {
  businessId: string;
  name: string;
  price: number;
  currency: string;
  cycle: SubscriptionCycle;
  /** `YYYY-MM-DD` — hasta cuándo está pago el servicio. */
  validUntil: string;
  graceDays: number;
  /** Días que faltan para `validUntil` (negativo si ya venció). Lo calcula el backend. */
  daysRemaining: number;
  /** `validUntil` ya pasó (con o sin gracia agotada). */
  expired: boolean;
  /** `validUntil + graceDays` también pasó → candidato a suspensión. */
  graceExpired: boolean;
  createdAt: string;
  updatedAt: string;
}

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.");

/** `PUT /admin/businesses/:id/subscription` — crea o reemplaza el plan del negocio. */
export const upsertSubscriptionSchema = z.object({
  name: z.string().trim().min(2).max(60).default(DEFAULT_PLAN.name),
  price: z.coerce.number().min(0).max(99_999_999),
  currency: z.string().trim().length(3).toUpperCase().default(DEFAULT_PLAN.currency),
  cycle: z.enum(subscriptionCycleValues).default(DEFAULT_PLAN.cycle),
  validUntil: isoDate,
  graceDays: z.coerce.number().int().min(0).max(60).default(DEFAULT_PLAN.graceDays),
});

export type UpsertSubscriptionInput = z.infer<typeof upsertSubscriptionSchema>;

/** `POST /admin/businesses/:id/subscription/extend` — corre `validUntil` sin registrar un pago. */
export const extendSubscriptionSchema = z.object({
  days: z.coerce.number().int().min(1).max(365),
  reason: z.string().trim().max(200).optional().or(z.literal("")),
});

export type ExtendSubscriptionInput = z.infer<typeof extendSubscriptionSchema>;
