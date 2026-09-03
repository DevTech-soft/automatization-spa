import { Prisma } from "@spa/db";

/** Violación de unique constraint (código P2002) — usado para idempotencia (sección 32). */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
