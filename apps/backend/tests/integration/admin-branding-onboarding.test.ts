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
vi.mock("../../src/services/admin-branding.service.js", () => ({
  getBranding: vi.fn(),
  updateBranding: vi.fn(),
}));
vi.mock("../../src/services/admin-onboarding.service.js", () => ({
  getOnboardingChecklist: vi.fn(),
  updateOnboardingManual: vi.fn(),
  activateBusiness: vi.fn(),
}));

const { buildApp } = await import("../../src/app.js");
const branding = await import("../../src/services/admin-branding.service.js");
const onboarding = await import("../../src/services/admin-onboarding.service.js");

const SESSION = { user: { id: "op-1", email: "op@example.com" }, session: { activeOrganizationId: null } };
const BID = "11111111-1111-1111-1111-111111111111";

describe("/admin/businesses/:id — marca y onboarding", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    getSessionMock.mockResolvedValue(SESSION);
  });
  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("exige sesión también en las rutas nuevas", async () => {
    getSessionMock.mockResolvedValue(null);
    for (const url of [`/admin/businesses/${BID}/branding`, `/admin/businesses/${BID}/onboarding`]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    }
    const res = await app.inject({ method: "POST", url: `/admin/businesses/${BID}/activate` });
    expect(res.statusCode).toBe(401);
  });

  it("GET branding devuelve la marca", async () => {
    vi.mocked(branding.getBranding).mockResolvedValue({ businessId: BID } as never);
    const res = await app.inject({ method: "GET", url: `/admin/businesses/${BID}/branding` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ businessId: BID });
  });

  it("PATCH branding valida el color hex", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/businesses/${BID}/branding`,
      payload: { colorPrimary: "azul" },
    });
    expect(res.statusCode).toBe(400);
    expect(branding.updateBranding).not.toHaveBeenCalled();
  });

  it("PATCH branding valida la URL del logo", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/businesses/${BID}/branding`,
      payload: { logoUrl: "no-es-una-url" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH branding acepta colores, agente y pasa el actor", async () => {
    vi.mocked(branding.updateBranding).mockResolvedValue({ businessId: BID } as never);
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/businesses/${BID}/branding`,
      payload: { colorPrimary: "#4f46e5", agentEnabled: true, agent: { nombreAgente: "Lucía" } },
    });
    expect(res.statusCode).toBe(200);
    expect(branding.updateBranding).toHaveBeenCalledWith(
      BID,
      { colorPrimary: "#4f46e5", agentEnabled: true, agent: { nombreAgente: "Lucía" } },
      "op-1",
    );
  });

  it("PATCH branding rechaza claves desconocidas del agente", async () => {
    vi.mocked(branding.updateBranding).mockResolvedValue({ businessId: BID } as never);
    await app.inject({
      method: "PATCH",
      url: `/admin/businesses/${BID}/branding`,
      payload: { agent: { nombreAgente: "Lucía", promptSecreto: "x" } },
    });
    const [, input] = vi.mocked(branding.updateBranding).mock.calls[0]!;
    expect(input.agent).toEqual({ nombreAgente: "Lucía" });
  });

  it("GET onboarding devuelve el checklist", async () => {
    vi.mocked(onboarding.getOnboardingChecklist).mockResolvedValue({
      businessId: BID,
      status: "TRIAL",
      steps: [],
      complete: false,
      canActivate: false,
    });
    const res = await app.inject({ method: "GET", url: `/admin/businesses/${BID}/onboarding` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.canActivate).toBe(false);
  });

  it("PATCH onboarding marca el paso manual", async () => {
    vi.mocked(onboarding.updateOnboardingManual).mockResolvedValue({ businessId: BID } as never);
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/businesses/${BID}/onboarding`,
      payload: { whatsappProfileApproved: true },
    });
    expect(res.statusCode).toBe(200);
    expect(onboarding.updateOnboardingManual).toHaveBeenCalledWith(
      BID,
      { whatsappProfileApproved: true },
      "op-1",
    );
  });

  it("POST activate delega en el servicio con el actor", async () => {
    vi.mocked(onboarding.activateBusiness).mockResolvedValue({ businessId: BID } as never);
    const res = await app.inject({ method: "POST", url: `/admin/businesses/${BID}/activate` });
    expect(res.statusCode).toBe(200);
    expect(onboarding.activateBusiness).toHaveBeenCalledWith(BID, "op-1");
  });

  it("id inválido → 400 en las rutas nuevas", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/businesses/not-a-uuid/onboarding" });
    expect(res.statusCode).toBe(400);
  });
});
