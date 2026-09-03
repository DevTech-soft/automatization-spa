import type { NextRequest } from "next/server";
import { BACKEND_URL } from "@/lib/env";

const BACKEND_ORIGIN = new URL(BACKEND_URL).origin;

/**
 * Proxy BFF de Better Auth (docs/PANEL-OPERADOR.md D12): el browser habla con el
 * panel (`/api/auth/*`) y esto reenvía al backend, pasando cuerpo y cookies en
 * ambos sentidos. La cookie de sesión queda first-party del panel — no hace
 * falta dominio compartido.
 *
 * CSRF: sólo se aceptan requests **same-origin** al propio panel; al reenviar,
 * el `Origin` se reescribe al del backend para que Better Auth lo vea como una
 * llamada same-origin (sus `trustedOrigins` sólo necesitan el propio backend).
 */
async function proxy(request: NextRequest, all: string[]): Promise<Response> {
  const requestOrigin = request.headers.get("origin");
  const panelOrigin = request.nextUrl.origin;
  if (requestOrigin && requestOrigin !== panelOrigin) {
    return Response.json({ error: "cross-origin request rejected" }, { status: 403 });
  }

  const target = `${BACKEND_ORIGIN}/api/auth/${all.join("/")}${request.nextUrl.search}`;
  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD";

  const upstream = await fetch(target, {
    method,
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      cookie: request.headers.get("cookie") ?? "",
      "user-agent": request.headers.get("user-agent") ?? "",
      "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
      origin: BACKEND_ORIGIN,
    },
    body: hasBody ? await request.text() : undefined,
    redirect: "manual",
  });

  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      headers.set(key, value);
    }
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

type Ctx = { params: Promise<{ all: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx): Promise<Response> {
  return proxy(request, (await ctx.params).all);
}

export async function POST(request: NextRequest, ctx: Ctx): Promise<Response> {
  return proxy(request, (await ctx.params).all);
}
