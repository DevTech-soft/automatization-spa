import type { Prisma } from "@spa/db";

/**
 * Los montos viven en Postgres como `numeric(12,2)` y Prisma los entrega como
 * `Decimal`, que `JSON.stringify` serializa como string. El panel espera
 * números, así que todo DTO de `/admin/*` los convierte aquí.
 *
 * Es seguro: 12 dígitos con 2 decimales caben de sobra en un `double` (que es
 * exacto hasta 2^53), y no se hace aritmética de dinero sobre el resultado —
 * las sumas se hacen en SQL (`aggregate`) o sobre valores ya redondeados.
 */
export function toMoney(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === "number" ? value : Number(value);
}

/** Igual que `toMoney` pero conserva el `null` (columnas de monto opcionales). */
export function toMoneyOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "number" ? value : Number(value);
}

/** Monto para mostrar en un mensaje: "$65.000" (es-CO, sin decimales). */
export function formatMoney(amount: number | string, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(
      Number(amount),
    );
  } catch {
    return `${amount} ${currency}`;
  }
}
