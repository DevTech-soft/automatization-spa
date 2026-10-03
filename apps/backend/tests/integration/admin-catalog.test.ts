import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock("../../src/auth/better-auth.js", () => ({
  isPanelAuthEnabled: true,
  auth: { api: { getSession: getSessionMock }, handler: vi.fn() },
}));
vi.mock("../../src/db/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) },
}));
vi.mock("../../src/services/admin-catalog.service.js", () => ({
  listCatalogServices: vi.fn(),
  createCatalogService: vi.fn(),
  updateCatalogService: vi.fn(),
  deleteCatalogService: vi.fn(),
  getBusinessHours: vi.fn(),
  updateBusinessHours: vi.fn(),
}));

const { buildApp } = await import("../../src/app.js");
const svc = await import("../../src/services/admin-catalog.service.js");
const { ConflictError } = await import("../../src/errors/index.js");

const SESSION = { user: { id: "op-1", email: "op@example.com", role: "operator" }, session: { activeOrganizationId: null } };
const BID = "11111111-1111-1111-1111-111111111111";
const SID = "22222222-2222-2222-2222-222222222222";

describe("/admin/businesses/:id/services y /hours", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    getSessionMock.mockResolvedValue(SESSION);
  });
  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("exige sesión de operador", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: `/admin/businesses/${BID}/services` });
    expect(res.statusCode).toBe(401);
  });

  it("POST crea un servicio con defaults y responde 201", async () => {
    vi.mocked(svc.createCatalogService).mockResolvedValue({ id: SID } as never);
    const res = await app.inject({
      method: "POST",
      url: `/admin/businesses/${BID}/services`,
      payload: { name: "Masaje", price: "80000", durationMinutes: "60", capacity: 1 },
    });
    expect(res.statusCode).toBe(201);
    expect(svc.createCatalogService).toHaveBeenCalledWith(
      BID,
      expect.objectContaining({ name: "Masaje", price: 80000, durationMinutes: 60, capacity: 1, active: true }),
      "op-1",
    );
  });

  it("POST con duración inválida → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/businesses/${BID}/services`,
      payload: { name: "Masaje", price: 80000, durationMinutes: 2, capacity: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(svc.createCatalogService).not.toHaveBeenCalled();
  });

  it("PATCH parcial no inyecta defaults", async () => {
    vi.mocked(svc.updateCatalogService).mockResolvedValue({ id: SID } as never);
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/businesses/${BID}/services/${SID}`,
      payload: { active: false },
    });
    expect(res.statusCode).toBe(200);
    expect(svc.updateCatalogService).toHaveBeenCalledWith(BID, SID, { active: false }, "op-1");
  });

  it("DELETE responde 204, o 409 si el servicio tiene citas", async () => {
    vi.mocked(svc.deleteCatalogService).mockResolvedValueOnce(undefined);
    const ok = await app.inject({ method: "DELETE", url: `/admin/businesses/${BID}/services/${SID}` });
    expect(ok.statusCode).toBe(204);

    vi.mocked(svc.deleteCatalogService).mockRejectedValueOnce(new ConflictError("tiene citas"));
    const conflict = await app.inject({ method: "DELETE", url: `/admin/businesses/${BID}/services/${SID}` });
    expect(conflict.statusCode).toBe(409);
  });

  it("PUT /hours valida que el cierre sea después de la apertura", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/admin/businesses/${BID}/hours`,
      payload: { days: [{ dayOfWeek: 1, openTime: "18:00", closeTime: "09:00", active: true }] },
    });
    expect(res.statusCode).toBe(400);
    expect(svc.updateBusinessHours).not.toHaveBeenCalled();
  });

  it("PUT /hours acepta un día cerrado con horas cruzadas y rechaza días repetidos", async () => {
    vi.mocked(svc.updateBusinessHours).mockResolvedValue([]);
    const closed = await app.inject({
      method: "PUT",
      url: `/admin/businesses/${BID}/hours`,
      payload: { days: [{ dayOfWeek: 0, openTime: "18:00", closeTime: "09:00", active: false }] },
    });
    expect(closed.statusCode).toBe(200);

    const dup = await app.inject({
      method: "PUT",
      url: `/admin/businesses/${BID}/hours`,
      payload: {
        days: [
          { dayOfWeek: 1, openTime: "09:00", closeTime: "18:00", active: true },
          { dayOfWeek: 1, openTime: "10:00", closeTime: "17:00", active: true },
        ],
      },
    });
    expect(dup.statusCode).toBe(400);
  });
});
