/**
 * Normaliza un teléfono a un formato consistente para que el dedup por
 * (business_id, phone) funcione sin importar cómo lo haya escrito el cliente
 * (espacios, guiones, con o sin "+").
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasLeadingPlus ? `+${digits}` : digits;
}
