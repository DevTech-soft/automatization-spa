import { JWT } from "google-auth-library";
import { logger } from "../../utils/logger.js";
import type { GoogleSheetsProvider } from "./GoogleSheetsProvider.js";

export interface GoogleSheetsApiConfig {
  serviceAccountEmail: string;
  privateKey: string;
  spreadsheetId: string;
}

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

/** Convierte un índice de columna 1-based a su letra de spreadsheet (1→A, 27→AA). */
function columnLetter(index: number): string {
  let n = index;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Adapter sobre la API REST de Google Sheets v4, autenticado con Service Account. */
export class GoogleSheetsApiProvider implements GoogleSheetsProvider {
  readonly name = "google-sheets";
  private readonly auth: JWT;
  private readonly spreadsheetId: string;
  private readonly knownSheets = new Set<string>();

  constructor(config: GoogleSheetsApiConfig) {
    // La clave privada del JSON de la Service Account trae "\n" literales
    // cuando viene de una variable de entorno de una sola línea.
    const privateKey = config.privateKey.includes("\\n") ? config.privateKey.replace(/\\n/g, "\n") : config.privateKey;
    this.auth = new JWT({ email: config.serviceAccountEmail, key: privateKey, scopes: SCOPES });
    this.spreadsheetId = config.spreadsheetId;
  }

  async ensureSheet(sheetName: string, headers: string[]): Promise<void> {
    if (this.knownSheets.has(sheetName)) {
      return;
    }

    const metadata = await this.request<{ sheets: { properties: { title: string } }[] }>(
      `${SHEETS_API_BASE}/${this.spreadsheetId}?fields=sheets.properties`,
    );
    const exists = metadata.sheets.some((sheet) => sheet.properties.title === sheetName);

    if (!exists) {
      await this.request(`${SHEETS_API_BASE}/${this.spreadsheetId}:batchUpdate`, {
        method: "POST",
        body: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
      });
      await this.writeRange(`${sheetName}!A1`, [headers]);
    }

    this.knownSheets.add(sheetName);
  }

  async upsertRow(sheetName: string, id: string, row: string[]): Promise<void> {
    const lastColumn = columnLetter(row.length);
    const existingIds = await this.request<{ values?: string[][] }>(
      `${SHEETS_API_BASE}/${this.spreadsheetId}/values/${encodeURIComponent(`${sheetName}!A:A`)}`,
    );
    const rowIndex = (existingIds.values ?? []).findIndex((cell) => cell[0] === id);

    if (rowIndex === -1) {
      await this.request(
        `${SHEETS_API_BASE}/${this.spreadsheetId}/values/${encodeURIComponent(`${sheetName}!A:${lastColumn}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: { values: [row] } },
      );
      return;
    }

    // `existingIds.values` incluye la fila de encabezado en el índice 0, que
    // corresponde exactamente a la fila 1 del sheet — así que el índice del
    // array ya es directamente el número de fila 1-based.
    const rowNumber = rowIndex + 1;
    await this.writeRange(`${sheetName}!A${rowNumber}:${lastColumn}${rowNumber}`, [row]);
  }

  private async writeRange(range: string, values: string[][]): Promise<void> {
    await this.request(
      `${SHEETS_API_BASE}/${this.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      { method: "PUT", body: { values } },
    );
  }

  private async request<T = unknown>(url: string, init?: { method: string; body: unknown }): Promise<T> {
    const { token } = await this.auth.getAccessToken();
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ status: response.status, errorBody, url }, "google_sheets_request_failed");
      throw new Error(`Google Sheets API respondió ${response.status}.`);
    }

    return (await response.json()) as T;
  }
}
