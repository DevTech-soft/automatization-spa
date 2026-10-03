import { z } from "zod";

/**
 * Catálogo del negocio: servicios y horarios de atención (docs/PANEL-OPERADOR.md
 * §6.1 pasos 3–4). Son lo que leen el bot, el agente y `/reservar` para ofrecer
 * citas; sin ellos el negocio no puede agendar nada.
 */

// — Servicios —

export interface ServiceDto {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  /** En la moneda del negocio. `Decimal(12,2)` en DB, número aquí. */
  price: number;
  durationMinutes: number;
  /** Citas simultáneas permitidas (ej. 3 sillas de manicure). */
  capacity: number;
  /** Inactivo = no se ofrece en ningún canal, pero conserva su historial. */
  active: boolean;
  /** Con citas no se puede borrar (FK `Restrict`): solo desactivar. */
  appointmentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export const upsertServiceSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres.").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  price: z.coerce
    .number({ message: "Precio inválido." })
    .min(0, "No puede ser negativo.")
    .max(100_000_000, "Precio demasiado alto."),
  durationMinutes: z.coerce
    .number({ message: "Duración inválida." })
    .int("Usa minutos enteros.")
    .min(5, "Mínimo 5 minutos.")
    .max(720, "Máximo 12 horas."),
  capacity: z.coerce
    .number({ message: "Capacidad inválida." })
    .int("Usa un número entero.")
    .min(1, "Mínimo 1.")
    .max(50, "Máximo 50."),
  active: z.boolean().default(true),
});

export type UpsertServiceInput = z.infer<typeof upsertServiceSchema>;

/** `PATCH`: cualquier subconjunto (ej. solo `{ active: false }` para pausarlo). */
export const updateServiceSchema = upsertServiceSchema.partial();

export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

// — Horarios de atención —

/** 0 = domingo … 6 = sábado (igual que `Date#getDay` y la columna `day_of_week`). */
export const weekdayLabels = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export interface BusinessHourDto {
  dayOfWeek: number;
  /** `HH:mm`, 24 h, en la zona horaria del negocio. */
  openTime: string;
  closeTime: string;
  /** `false` = cerrado ese día. */
  active: boolean;
}

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usa el formato HH:mm.");

export const businessHourSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    openTime: timeSchema,
    closeTime: timeSchema,
    active: z.boolean(),
  })
  // Sin turnos que crucen la medianoche: la disponibilidad trabaja dentro del día.
  .refine((d) => !d.active || d.openTime < d.closeTime, {
    message: "El cierre debe ser después de la apertura.",
    path: ["closeTime"],
  });

/**
 * `PUT /admin/businesses/:id/hours`: la semana completa de una vez. Los días que
 * no vengan quedan como estén; para cerrar un día se manda `active: false`.
 */
export const updateBusinessHoursSchema = z.object({
  days: z
    .array(businessHourSchema)
    .min(1)
    .max(7)
    .refine((days) => new Set(days.map((d) => d.dayOfWeek)).size === days.length, {
      message: "Hay días repetidos.",
    }),
});

export type UpdateBusinessHoursInput = z.infer<typeof updateBusinessHoursSchema>;
