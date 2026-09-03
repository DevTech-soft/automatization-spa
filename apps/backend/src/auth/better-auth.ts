import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, organization, twoFactor } from "better-auth/plugins";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Better Auth vive en ESTE backend (docs/PANEL-OPERADOR.md §8/§9): el panel
 * (Vercel) es cliente puro y nunca abre Postgres (D10). El panel usa el patrón
 * BFF — sus route handlers de Next reenvían a `/api/auth/*` y `/admin/*` con la
 * sesión adjunta server-side; el plugin `bearer` permite mandar el token en
 * `Authorization: Bearer` además de la cookie.
 *
 * v1: un solo usuario `operator` (dado de alta con `scripts/create-operator.ts`),
 * sin verificación por correo (no hay infra de email). El plugin `organization`
 * se habilita desde ya —`businessId` = tenant— aunque los roles de cliente
 * (`client_owner`/`client_staff`) recién se activan en F7 (§8.5).
 */

const baseURL = env.BETTER_AUTH_URL || env.APP_URL;
const trustedOrigins = [env.PANEL_URL, env.APP_URL].filter((value): value is string => Boolean(value));

if (!env.BETTER_AUTH_SECRET) {
  logger.warn(
    "better_auth_secret_missing: BETTER_AUTH_SECRET no configurado — el panel de operador no funcionará (ver docs/PANEL-OPERADOR.md §9).",
  );
}

export const auth = betterAuth({
  baseURL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET || undefined,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 12,
  },
  // El panel es cross-site respecto al backend; la cookie de sesión debe cruzar.
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  },
  plugins: [bearer(), twoFactor(), organization()],
});

export type Auth = typeof auth;
