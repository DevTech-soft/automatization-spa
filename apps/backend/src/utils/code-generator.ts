import { customAlphabet } from "nanoid";

// Sin caracteres ambiguos (0/O, 1/I/L) para que el código sea fácil de leer/dictar.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generate = customAlphabet(ALPHABET, 8);

/** Genera un código corto tipo "APT-7F9K2M3X". Reutilizable por citas y (Fase 8) Gift Cards. */
export function generateCode(prefix: string): string {
  return `${prefix}-${generate()}`;
}
