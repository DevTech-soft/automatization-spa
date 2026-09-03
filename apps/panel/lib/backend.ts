import "server-only";
import { cookies } from "next/headers";
import type { AdminMeResponse } from "@spa/shared";
import { BACKEND_URL } from "./env";

/**
 * Fetch al backend desde el servidor del panel (BFF, D12). Reenvía las cookies
 * de la request entrante para que Better Auth resuelva la sesión del operador.
 * Nunca se llama desde el browser.
 */
export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieHeader = (await cookies()).toString();
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    cache: "no-store",
  });
}

/** Devuelve al operador de la sesión actual, o `null` si no hay sesión válida. */
export async function getOperator(): Promise<AdminMeResponse | null> {
  try {
    const res = await backendFetch("/admin/me");
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { data: AdminMeResponse };
    return body.data;
  } catch {
    return null;
  }
}
