import { env } from "../../config/env.js";
import { SupabaseStorageProvider } from "./SupabaseStorageProvider.js";
import type { StorageProvider } from "./StorageProvider.js";

export type { StorageProvider } from "./StorageProvider.js";

let cached: StorageProvider | undefined;

export function getStorageProvider(): StorageProvider {
  cached ??= new SupabaseStorageProvider({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: env.STORAGE_BUCKET,
  });
  return cached;
}
