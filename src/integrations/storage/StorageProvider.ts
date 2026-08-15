/**
 * Capa de abstracción de almacenamiento de archivos (sección 27 del prompt
 * maestro). Usado para las imágenes de Gift Cards (Fase 8).
 */
export interface StorageProvider {
  readonly name: string;

  upload(path: string, data: Buffer, contentType: string): Promise<void>;

  getPublicUrl(path: string): string;

  delete(path: string): Promise<void>;
}
