import { logger } from "../../utils/logger.js";
import type { StorageProvider } from "./StorageProvider.js";

export interface SupabaseStorageConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucket: string;
}

/** Adapter sobre la API REST de Supabase Storage (sección 27). */
export class SupabaseStorageProvider implements StorageProvider {
  readonly name = "supabase-storage";
  private bucketEnsured = false;

  constructor(private readonly config: SupabaseStorageConfig) {}

  async upload(path: string, data: Buffer, contentType: string): Promise<void> {
    await this.ensureBucket();

    const response = await fetch(
      `${this.config.supabaseUrl}/storage/v1/object/${this.config.bucket}/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.serviceRoleKey}`,
          apikey: this.config.serviceRoleKey,
          "Content-Type": contentType,
          "x-upsert": "true",
        },
        body: data,
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ status: response.status, errorBody, path }, "supabase_storage_upload_failed");
      throw new Error(`No se pudo subir el archivo a Supabase Storage (status ${response.status}).`);
    }
  }

  getPublicUrl(path: string): string {
    return `${this.config.supabaseUrl}/storage/v1/object/public/${this.config.bucket}/${path}`;
  }

  async delete(path: string): Promise<void> {
    const response = await fetch(
      `${this.config.supabaseUrl}/storage/v1/object/${this.config.bucket}/${path}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.config.serviceRoleKey}`,
          apikey: this.config.serviceRoleKey,
        },
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ status: response.status, errorBody, path }, "supabase_storage_delete_failed");
      throw new Error(`No se pudo borrar el archivo de Supabase Storage (status ${response.status}).`);
    }
  }

  /** Crea el bucket público si no existe todavía. Idempotente, cachea en memoria. */
  private async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) {
      return;
    }

    const check = await fetch(`${this.config.supabaseUrl}/storage/v1/bucket/${this.config.bucket}`, {
      headers: {
        Authorization: `Bearer ${this.config.serviceRoleKey}`,
        apikey: this.config.serviceRoleKey,
      },
    });

    if (!check.ok) {
      // Supabase Storage responde con HTTP 400 (no 404) y code "NoSuchBucket" cuando el bucket no existe.
      const checkBody = await check.text();
      const notFound = check.status === 404 || checkBody.includes("NoSuchBucket");
      if (!notFound) {
        logger.error({ status: check.status, errorBody: checkBody }, "supabase_storage_bucket_check_failed");
        throw new Error(`No se pudo verificar el bucket "${this.config.bucket}" en Supabase Storage.`);
      }

      const create = await fetch(`${this.config.supabaseUrl}/storage/v1/bucket`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.serviceRoleKey}`,
          apikey: this.config.serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: this.config.bucket, name: this.config.bucket, public: true }),
      });
      if (!create.ok) {
        const errorBody = await create.text();
        logger.error({ status: create.status, errorBody }, "supabase_storage_bucket_create_failed");
        throw new Error(`No se pudo crear el bucket "${this.config.bucket}" en Supabase Storage.`);
      }
    }

    this.bucketEnsured = true;
  }
}
