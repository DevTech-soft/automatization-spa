/** Reglas de negocio compartidas entre disponibilidad y creación de reservas (sección 10/11). */
export const MAX_BOOKING_DAYS_AHEAD = 60;
export const PENDING_EXPIRATION_MINUTES = 15;
export const AVAILABILITY_SLOT_GRANULARITY_MINUTES = 30;

/**
 * Diseños disponibles para la Gift Card (sección 14/42) — MVP: paletas fijas,
 * sin editor visual. `clasico`/`clasico-puente` y `floral`/`floral-tulipanes`
 * son pares de la misma paleta con distinto motivo decorativo
 * (`gift-card-motifs.ts`), para que el comprador elija cuál le queda mejor.
 */
export const GIFT_CARD_DESIGNS = ["clasico", "clasico-puente", "floral", "floral-tulipanes", "elegante"] as const;
export type GiftCardDesign = (typeof GIFT_CARD_DESIGNS)[number];

/** Usado si `business.settings.gift_card_validity_days` no está configurado. */
export const DEFAULT_GIFT_CARD_VALIDITY_DAYS = 365;

/**
 * Recordatorios (sección 21/Fase 9): se envían cuando falta aproximadamente
 * este número de horas para el inicio de la cita, con una ventana de
 * tolerancia igual a la frecuencia con la que corre el cron (scheduler.ts) —
 * la idempotencia real la da `notification_log`, esta ventana solo evita
 * recorrer todas las citas confirmadas en cada corrida.
 */
export const REMINDER_HOURS_BEFORE = 24;
export const REMINDER_WINDOW_MINUTES = 90;
