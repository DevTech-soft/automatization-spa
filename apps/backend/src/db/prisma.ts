import { PrismaClient } from "@spa/db";
import { env } from "../config/env.js";

/**
 * Cliente único de Prisma para todo el proceso. El backend usa el service role
 * de Supabase vía DATABASE_URL — el frontend y n8n nunca acceden a la base de
 * datos directamente (ver docs/ARCHITECTURE.md, sección "Multi-tenant").
 */
export const prisma = new PrismaClient({
  log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
