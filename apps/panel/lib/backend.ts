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

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** GET a `/admin/*` → `data`. Lanza `ApiError` si no es 2xx. */
export async function adminGet<T>(path: string): Promise<T> {
  const res = await backendFetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.message ?? "Error al consultar el backend.");
  }
  return body.data as T;
}

/** POST/PATCH a `/admin/*` con JSON. Lanza `ApiError` (con `fieldErrors` si el backend los da). */
export async function adminMutate<T>(
  method: "POST" | "PATCH",
  path: string,
  payload: unknown,
): Promise<T> {
  const res = await backendFetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.message ?? "No se pudo guardar.",
      body?.error?.fieldErrors,
    );
  }
  return body.data as T;
}
