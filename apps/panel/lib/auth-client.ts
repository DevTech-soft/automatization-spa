"use client";

import { createAuthClient } from "better-auth/react";
import { organizationClient, twoFactorClient } from "better-auth/client/plugins";

/**
 * Cliente de Better Auth para los componentes de cliente del panel. Apunta al
 * proxy BFF del propio panel (`<origen>/api/auth/*` → backend), nunca al backend
 * directo. En el browser usa el origen real; durante el prerender de Next se usa
 * un valor placeholder (el cliente solo se ejecuta de verdad tras interacción).
 */
const baseURL =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_PANEL_URL ?? "http://localhost:3100");

export const authClient = createAuthClient({
  baseURL,
  plugins: [twoFactorClient(), organizationClient()],
});

export const { signIn, signOut, useSession } = authClient;
