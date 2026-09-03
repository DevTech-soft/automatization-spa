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

/**
 * `true` sólo si el panel está configurado. Cuando falta el secreto, `app.ts`
 * NO monta `/api/auth/*` ni `/admin/*` — el backend arranca normal y solo el
 * panel queda inactivo (antes: Better Auth tiraba `BetterAuthError` con el
 * secreto por defecto y mataba el proceso).
 */
export const isPanelAuthEnabled = Boolean(env.BETTER_AUTH_SECRET);

if (!isPanelAuthEnabled) {
  logger.warn(
    "better_auth_secret_missing: BETTER_AUTH_SECRET no configurado — el panel de operador queda inactivo (rutas /api/auth/* y /admin/* no montadas). Ver docs/PANEL-OPERADOR.md §9.",
  );
}

const isProd = env.NODE_ENV === "production";

export const auth = betterAuth({
  baseURL,
  basePath: "/api/auth",
  // Nunca el string por defecto de la librería: si falta el secreto, un valor
  // propio evita el crash y las rutas ni se montan.
  secret: env.BETTER_AUTH_SECRET || "spa-panel-auth-disabled-no-secret-configured",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 12,
  },
  advanced: {
    // En prod el panel (Vercel) es cross-site respecto al backend → la cookie
    // debe cruzar. En dev sobre http, `Secure` la haría inservible.
    defaultCookieAttributes: {
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
    },
  },
  plugins: [bearer(), twoFactor(), organization()],
});

export type Auth = typeof auth;
