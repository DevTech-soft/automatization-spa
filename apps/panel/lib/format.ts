/**
 * Formato de números y fechas del panel. Todo en `es-CO`: el operador y sus
 * clientes son colombianos, y los montos son pesos sin decimales.
 *
 * Las fechas de calendario (`YYYY-MM-DD`) se formatean **sin** construir un
 * `Date` con zona: `new Date("2026-09-08")` se interpreta como UTC y en Bogotá
 * retrocede un día. Se parte el string y punto.
 */

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

export function formatMoney(amount: number, currency = "COP"): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-CO").format(value);
}

/** `2026-09-08` → `8 sep 2026`. */
export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return date;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** Timestamp ISO → `8 sep 2026, 14:32` en la zona del navegador del operador. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${formatDate(date.toISOString())}, ${date.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** "en 4 días" / "hace 7 días" / "hoy" — para vencimientos. */
export function formatDaysRemaining(days: number): string {
  if (days === 0) return "vence hoy";
  if (days === 1) return "vence mañana";
  if (days > 0) return `en ${days} días`;
  if (days === -1) return "venció ayer";
  return `hace ${Math.abs(days)} días`;
}

/** Porcentaje de cambio entre dos meses, o `null` si el mes previo fue cero. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
