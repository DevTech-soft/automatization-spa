import { timingSafeEqual } from "node:crypto";

/**
 * Compara dos strings en tiempo constante (sección 29 — hardening de Fase 10).
 * Un `!==` normal filtra, por el tiempo de respuesta, cuántos caracteres
 * iniciales coinciden — explotable en secretos cortos como `STAFF_PIN`
 * (4-6 dígitos). Usado también para `INTERNAL_JOBS_TOKEN`.
 */
export function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    // Igual costo que una comparación real, para no filtrar la longitud por timing.
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}
