import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Cifrado simétrico de secretos por-tenant en reposo (docs/PANEL-OPERADOR.md §9):
 * los tokens de WhatsApp y las llaves de Wompi se guardan cifrados en las
 * columnas `*_enc` de `whatsapp_accounts` / `payment_credentials`.
 *
 * AES-256-GCM (cifrado autenticado) con la clave maestra `SECRETS_ENCRYPTION_KEY`
 * (env de Railway). GCM detecta cualquier manipulación del texto cifrado al
 * descifrar — `decryptSecret` lanza en vez de devolver basura.
 *
 * Formato almacenado: `v1:<base64(iv[12] || authTag[16] || ciphertext)>`.
 * El prefijo de versión deja espacio para rotar clave o algoritmo más adelante;
 * la rotación de la clave maestra en sí queda como trabajo posterior (§11).
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

function getKey(): Buffer {
  const raw = env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY no está configurada — requerida para cifrar secretos " +
        "por-tenant (docs/PANEL-OPERADOR.md §9). Genera una con: openssl rand -base64 32",
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `SECRETS_ENCRYPTION_KEY debe decodificar (base64) a ${KEY_BYTES} bytes para AES-256; ` +
        `son ${key.length}. Genera una con: openssl rand -base64 32`,
    );
  }

  return key;
}

/** Cifra un valor en claro. Devuelve el string a guardar en la columna `*_enc`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${VERSION}:${Buffer.concat([iv, authTag, ciphertext]).toString("base64")}`;
}

/**
 * Descifra un valor producido por `encryptSecret`. Lanza si el formato no se
 * reconoce, si la clave no coincide o si el texto cifrado fue manipulado.
 */
export function decryptSecret(payload: string): string {
  const separator = payload.indexOf(":");
  const version = separator === -1 ? "" : payload.slice(0, separator);
  const blob = separator === -1 ? "" : payload.slice(separator + 1);

  if (version !== VERSION || !blob) {
    throw new Error(`Formato de secreto cifrado no reconocido (se esperaba "${VERSION}:...").`);
  }

  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error("Secreto cifrado corrupto: payload demasiado corto.");
  }

  const iv = buf.subarray(0, IV_BYTES);
  const authTag = buf.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + AUTH_TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** True si `value` tiene el prefijo de un secreto ya cifrado por `encryptSecret`. */
export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}
