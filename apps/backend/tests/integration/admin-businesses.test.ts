import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock("../../src/auth/better-auth.js", () => ({
  isPanelAuthEnabled: true,
  auth: { api: { getSession: getSessionMock }, handler: vi.fn() },
}));
vi.mock("../../src/db/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) },
}));
vi.mock("../../src/services/admin-business.service.js", () => ({
  listBusinesses: vi.fn(),
  getBusiness: vi.fn(),
  createBusiness: vi.fn(),
  updateBusiness: vi.fn(),
}));

const { buildApp } = await import("../../src/app.js");
const svc = await import("../../src/services/admin-business.service.js");

const SESSION = { user: { id: "op-1", email: "op@example.com" }, session: { activeOrganizationId: null } };
const BID = "11111111-1111-1111-1111-111111111111";

describe("/admin/businesses", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    getSessionMock.mockResolvedValue(SESSION);
  });
  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("exige sesión (401 sin operador)", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/admin/businesses" });
    expect(res.statusCode).toBe(401);
  });

  it("GET lista con paginación por defecto", async () => {
    vi.mocked(svc.listBusinesses).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
    });
    const res = await app.inject({ method: "GET", url: "/admin/businesses?q=demo" });
    expect(res.statusCode).toBe(200);
    expect(svc.listBusinesses).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20, order: "desc", q: "demo" }),
    );
  });

  it("GET :id inválido → 400", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/businesses/not-a-uuid" });
    expect(res.statusCode).toBe(400);
  });

  it("POST crea y responde 201", async () => {
    vi.mocked(svc.createBusiness).mockResolvedValue({ id: BID, slug: "nuevo-spa" } as never);
    const res = await app.inject({
      method: "POST",
      url: "/admin/businesses",
      payload: { name: "Nuevo Spa", slug: "nuevo-spa" },
    });
    expect(res.statusCode).toBe(201);
    expect(svc.createBusiness).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Nuevo Spa", slug: "nuevo-spa", timezone: "America/Bogota", currency: "COP" }),
      "op-1",
    );
  });

  it("POST con slug inválido → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/businesses",
      payload: { name: "X Spa", slug: "Mal Slug!" },
    });
    expect(res.statusCode).toBe(400);
    expect(svc.createBusiness).not.toHaveBeenCalled();
  });

  it("PATCH actualiza y pasa el actor", async () => {
    vi.mocked(svc.updateBusiness).mockResolvedValue({ id: BID } as never);
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/businesses/${BID}`,
      payload: { status: "ACTIVE" },
    });
    expect(res.statusCode).toBe(200);
    expect(svc.updateBusiness).toHaveBeenCalledWith(BID, { status: "ACTIVE" }, "op-1");
  });
});
