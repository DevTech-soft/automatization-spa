import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AdminMeResponse, PortalMeResponse } from "@spa/shared";
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

/**
 * Devuelve al operador de la sesión actual, o `null` si no hay sesión válida.
 * `cookies()` se lee fuera del `try`: dentro, el `catch` se tragaría la señal
 * con la que Next marca la ruta como dinámica e intentaría prerenderizarla.
 */
export const getOperator = cache(async (): Promise<AdminMeResponse | null> => {
  await cookies();
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
});

/**
 * Usuario del portal de un spa (F7), o `null` si la sesión no es de un cliente
 * (sin sesión, o es el operador). El backend fija el negocio desde la membresía.
 * `cache`: el layout y la página lo piden en la misma request.
 */
export const getPortalUser = cache(async (): Promise<PortalMeResponse | null> => {
  await cookies();
  try {
    const res = await backendFetch("/portal/me");
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { data: PortalMeResponse };
    return body.data;
  } catch {
    return null;
  }
});

/** Para las páginas del portal: el layout ya garantizó que hay usuario. */
export async function requirePortalUser(): Promise<PortalMeResponse> {
  const viewer = await getPortalUser();
  if (!viewer) {
    redirect("/login");
  }
  return viewer;
}

/** A dónde mandar a quien ya inició sesión: cada rol tiene su superficie. */
export async function homeForSession(): Promise<"/dashboard" | "/portal" | null> {
  if (await getOperator()) return "/dashboard";
  if (await getPortalUser()) return "/portal";
  return null;
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

/** GET a `/admin/*` o `/portal/*` → `data`. Lanza `ApiError` si no es 2xx. */
export async function adminGet<T>(path: string): Promise<T> {
  const res = await backendFetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.message ?? "Error al consultar el backend.");
  }
  return body.data as T;
}

/** POST/PATCH/PUT a `/admin/*` con JSON. Lanza `ApiError` (con `fieldErrors` si el backend los da). */
export async function adminMutate<T>(
  method: "POST" | "PATCH" | "PUT",
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

/** DELETE a `/admin/*`. Tolera el 204 sin cuerpo que devuelven las bajas. */
export async function adminDelete(path: string): Promise<void> {
  const res = await backendFetch(path, { method: "DELETE" });
  if (res.ok) {
    return;
  }
  const body = await res.json().catch(() => ({}));
  throw new ApiError(res.status, body?.error?.message ?? "No se pudo eliminar.");
}
