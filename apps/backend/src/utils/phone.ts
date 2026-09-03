/**
 * Normaliza un teléfono a un formato consistente para que el dedup por
 * (business_id, phone) funcione sin importar cómo lo haya escrito el cliente
 * (espacios, guiones, con o sin "+").
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = digitsOnly(trimmed);
  return hasLeadingPlus ? `+${digits}` : digits;
}

/** Solo dígitos, sin "+" — para comparar números que llegan en formatos distintos (ej. Meta vs. seed). */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}
