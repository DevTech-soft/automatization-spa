import { env } from "../../config/env.js";
import { GoogleSheetsApiProvider } from "./GoogleSheetsApiProvider.js";
import type { GoogleSheetsProvider } from "./GoogleSheetsProvider.js";

export type { GoogleSheetsProvider } from "./GoogleSheetsProvider.js";

function requireConfig(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Falta configurar ${name} en las variables de entorno para sincronizar con Google Sheets (ver docs/GOOGLE-SHEETS.md).`,
    );
  }
  return value;
}

let cached: GoogleSheetsProvider | undefined;

/** Única instancia — evita recrear el cliente JWT (y su caché de token) en cada llamada. */
export function getGoogleSheetsProvider(): GoogleSheetsProvider {
  cached ??= new GoogleSheetsApiProvider({
    serviceAccountEmail: requireConfig(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, "GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    privateKey: requireConfig(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
    spreadsheetId: requireConfig(env.GOOGLE_SHEET_ID, "GOOGLE_SHEET_ID"),
  });
  return cached;
}
