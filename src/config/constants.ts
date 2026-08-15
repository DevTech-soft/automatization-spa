/** Reglas de negocio compartidas entre disponibilidad y creación de reservas (sección 10/11). */
export const MAX_BOOKING_DAYS_AHEAD = 60;
export const PENDING_EXPIRATION_MINUTES = 15;
export const AVAILABILITY_SLOT_GRANULARITY_MINUTES = 30;

/** Diseños disponibles para la Gift Card (sección 14/42) — MVP: paletas fijas, sin editor visual. */
export const GIFT_CARD_DESIGNS = ["clasico", "floral", "elegante"] as const;
export type GiftCardDesign = (typeof GIFT_CARD_DESIGNS)[number];

/** Usado si `business.settings.gift_card_validity_days` no está configurado. */
export const DEFAULT_GIFT_CARD_VALIDITY_DAYS = 365;
