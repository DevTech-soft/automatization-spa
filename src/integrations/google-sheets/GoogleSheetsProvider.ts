/**
 * Capa de abstracción de la vista administrativa en Google Sheets (sección 19
 * y 24 del prompt maestro). Nunca es la fuente de verdad — un fallo acá jamás
 * debe bloquear una reserva o un pago (ver `google-sheets-sync.service.ts`).
 */
export interface GoogleSheetsProvider {
  readonly name: string;

  /** Crea la hoja (tab) con encabezados si no existe todavía. Idempotente. */
  ensureSheet(sheetName: string, headers: string[]): Promise<void>;

  /**
   * Busca una fila cuya columna A sea igual a `id` y la reemplaza; si no
   * existe, la agrega al final. La columna A siempre es el ID de la entidad.
   */
  upsertRow(sheetName: string, id: string, row: string[]): Promise<void>;
}
