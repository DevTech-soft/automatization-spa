import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, handlerMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  handlerMock: vi.fn(),
}));

vi.mock("../../src/auth/better-auth.js", () => ({
  isPanelAuthEnabled: true,
  auth: {
    api: { getSession: getSessionMock },
    handler: handlerMock,
  },
}));
vi.mock("../../src/db/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) },
}));

const { buildApp } = await import("../../src/app.js");

describe("/admin/* — guard de sesión del operador", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("GET /admin/me sin sesión responde 401", async () => {
    getSessionMock.mockResolvedValue(null);

    const response = await app.inject({ method: "GET", url: "/admin/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });

  it("GET /admin/me con sesión válida responde 200 con el operador", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "user-1", email: "op@example.com" },
      session: { activeOrganizationId: null },
    });

    const response = await app.inject({
      method: "GET",
      url: "/admin/me",
      headers: { authorization: "Bearer fake-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      userId: "user-1",
      email: "op@example.com",
      activeOrganizationId: null,
    });
  });

  it("propaga activeOrganizationId de la sesión", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "user-1", email: "op@example.com" },
      session: { activeOrganizationId: "org-9" },
    });

    const response = await app.inject({ method: "GET", url: "/admin/me" });

    expect(response.json().data.activeOrganizationId).toBe("org-9");
  });
});

describe("/api/auth/* — Better Auth montado sobre Fastify", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("reenvía a auth.handler y devuelve su respuesta (incl. Set-Cookie múltiples)", async () => {
    handlerMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: [
          ["content-type", "application/json"],
          ["set-cookie", "a=1; Path=/"],
          ["set-cookie", "b=2; Path=/"],
        ],
      }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: "op@example.com", password: "x".repeat(12) },
    });

    expect(handlerMock).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    const cookies = response.headers["set-cookie"];
    expect(Array.isArray(cookies) ? cookies : [cookies]).toEqual(["a=1; Path=/", "b=2; Path=/"]);
  });
});
