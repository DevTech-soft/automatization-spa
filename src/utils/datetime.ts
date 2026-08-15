import { DateTime } from "luxon";

/**
 * Único punto de conversión de fecha/hora del proyecto. Toda la lógica de
 * disponibilidad y reservas debe pasar por aquí para evitar bugs de timezone
 * (ver docs/ARCHITECTURE.md).
 *
 * Convención:
 * - `appointment_date` / fechas de calendario se tratan como strings "YYYY-MM-DD"
 *   puros (sin timezone) — el día de la semana de una fecha es el mismo sin
 *   importar el timezone, así que se parsean siempre en zona "utc".
 * - `start_time` / `end_time` son horas de pared ("HH:mm") en el timezone del
 *   negocio, sin componente de fecha.
 * - "Ahora" siempre se calcula en el timezone del negocio (`businessNow`).
 */

export function businessNow(timezone: string): DateTime {
  return DateTime.now().setZone(timezone);
}

export function businessToday(timezone: string): string {
  const today = businessNow(timezone).toISODate();
  if (!today) {
    throw new Error(`No se pudo calcular la fecha actual para el timezone "${timezone}".`);
  }
  return today;
}

export function currentMinutesInBusinessDay(timezone: string): number {
  const now = businessNow(timezone);
  return now.hour * 60 + now.minute;
}

/** Parsea una fecha "YYYY-MM-DD" como calendario puro (sin desplazamiento por timezone). */
export function parseCalendarDate(date: string): DateTime {
  return DateTime.fromISO(date, { zone: "utc" });
}

export function isValidCalendarDate(date: string): boolean {
  return parseCalendarDate(date).isValid;
}

/** 0 = domingo ... 6 = sábado, misma convención que business_hours.day_of_week. */
export function calendarDayOfWeek(date: string): number {
  const weekday = parseCalendarDate(date).weekday; // Luxon: 1=lunes..7=domingo
  return weekday % 7;
}

/** Días de diferencia entre dos fechas "YYYY-MM-DD" (positivo si `date` es posterior a `from`). */
export function daysBetween(from: string, date: string): number {
  return parseCalendarDate(date).diff(parseCalendarDate(from), "days").days;
}

/** Convierte una fecha "YYYY-MM-DD" al `Date` usado para columnas `@db.Date` de Prisma. */
export function dateOnlyToUTCDate(date: string): Date {
  return parseCalendarDate(date).toJSDate();
}

/** Inversa de `dateOnlyToUTCDate`: recupera "YYYY-MM-DD" desde una columna `@db.Date`. */
export function dateOnlyFromUTCDate(date: Date): string {
  const isoDate = DateTime.fromJSDate(date, { zone: "utc" }).toISODate();
  if (!isoDate) {
    throw new Error(`No se pudo convertir la fecha ${date.toISOString()} a "YYYY-MM-DD".`);
  }
  return isoDate;
}

export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
