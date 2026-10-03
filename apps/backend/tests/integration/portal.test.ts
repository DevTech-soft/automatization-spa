import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, findMembershipsMock, activity, metrics, portalService, usersService, chats, appointmentActions } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  chats: { listChats: vi.fn(), getChat: vi.fn(), assertBusinessExists: vi.fn() },
  appointmentActions: { applyAppointmentAction: vi.fn() },
  findMembershipsMock: vi.fn(),
  activity: {
    listAppointments: vi.fn(),
    listPayments: vi.fn(),
    listConversations: vi.fn(),
    listGiftCards: vi.fn(),
  },
  metrics: { getOverview: vi.fn(), getBusinessUsage: vi.fn() },
  portalService: { getPortalMe: vi.fn(), listCustomers: vi.fn(), getCustomer: vi.fn() },
  usersService: {
    listBusinessUsers: vi.fn(),
    createBusinessUser: vi.fn(),
    updateBusinessUser: vi.fn(),
    resetBusinessUserPassword: vi.fn(),
    removeBusinessUser: vi.fn(),
  },
}));

vi.mock("../../src/auth/better-auth.js", () => ({
  isPanelAuthEnabled: true,
  auth: { api: { getSession: getSessionMock }, handler: vi.fn() },
}));
vi.mock("../../src/db/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) },
}));
vi.mock("../../src/repositories/portalUser.repository.js", () => ({
  portalUserRepository: { findMemberships: findMembershipsMock },
}));
vi.mock("../../src/services/admin-activity.service.js", () => activity);
vi.mock("../../src/services/admin-metrics.service.js", () => metrics);
vi.mock("../../src/services/portal.service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/services/portal.service.js")>()),
  listCustomers: portalService.listCustomers,
  getCustomer: portalService.getCustomer,
}));
vi.mock("../../src/services/admin-users.service.js", () => usersService);
vi.mock("../../src/services/chat.service.js", () => chats);
vi.mock("../../src/services/appointment-actions.service.js", () => appointmentActions);

const { buildApp } = await import("../../src/app.js");

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_BUSINESS_ID = "22222222-2222-4222-8222-222222222222";

const OPERATOR_SESSION = {
  user: { id: "op-1", email: "op@example.com", name: "Op", role: "operator" },
  session: { activeOrganizationId: null },
};
const CLIENT_SESSION = {
  user: { id: "cli-1", email: "spa@example.com", name: "Dueña", role: "client" },
  session: { activeOrganizationId: null },
};

function membership(role: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "mem-1",
    organizationId: "org-1",
    userId: "cli-1",
    role,
    organization: {
      id: "org-1",
      business: {
        id: BUSINESS_ID,
        name: "Spa Uno",
        slug: "spa-uno",
        status: "ACTIVE",
        active: true,
        timezone: "America/Bogota",
        currency: "COP",
        logoUrl: null,
        colorPrimary: null,
        colorSecondary: null,
        ...overrides,
      },
    },
  };
}

const EMPTY_PAGE = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };

describe("separación operador / portal de cliente (F7)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    activity.listAppointments.mockResolvedValue(EMPTY_PAGE);
    metrics.getBusinessUsage.mockResolvedValue({ businessId: BUSINESS_ID });
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("un usuario de un spa no entra a /admin/* (403)", async () => {
    getSessionMock.mockResolvedValue(CLIENT_SESSION);

    const response = await app.inject({ method: "GET", url: "/admin/businesses" });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("una sesión sin rol (usuario previo a F7 sin backfill) no entra a /admin/*", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "x", email: "x@example.com" }, session: {} });

    const response = await app.inject({ method: "GET", url: "/admin/me" });

    expect(response.statusCode).toBe(403);
  });

  it("el operador no usa /portal/* (403)", async () => {
    getSessionMock.mockResolvedValue(OPERATOR_SESSION);

    const response = await app.inject({ method: "GET", url: "/portal/me" });

    expect(response.statusCode).toBe(403);
    expect(findMembershipsMock).not.toHaveBeenCalled();
  });

  it("sin sesión, /portal/* responde 401", async () => {
    getSessionMock.mockResolvedValue(null);

    const response = await app.inject({ method: "GET", url: "/portal/me" });

    expect(response.statusCode).toBe(401);
  });

  it("un cliente sin membresía recibe 403", async () => {
    getSessionMock.mockResolvedValue(CLIENT_SESSION);
    findMembershipsMock.mockResolvedValue([]);

    const response = await app.inject({ method: "GET", url: "/portal/me" });

    expect(response.statusCode).toBe(403);
  });

  it("GET /portal/me devuelve el negocio de la membresía", async () => {
    getSessionMock.mockResolvedValue(CLIENT_SESSION);
    findMembershipsMock.mockResolvedValue([membership("owner")]);

    const response = await app.inject({ method: "GET", url: "/portal/me" });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      userId: "cli-1",
      role: "owner",
      business: { id: BUSINESS_ID, name: "Spa Uno" },
    });
  });

  it("el tenant sale de la membresía, no de la query", async () => {
    getSessionMock.mockResolvedValue(CLIENT_SESSION);
    findMembershipsMock.mockResolvedValue([membership("member")]);

    const response = await app.inject({
      method: "GET",
      url: `/portal/appointments?businessId=${OTHER_BUSINESS_ID}&id=${OTHER_BUSINESS_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(activity.listAppointments).toHaveBeenCalledWith(BUSINESS_ID, expect.anything(), expect.anything());
  });

  it("con varias membresías manda la organización activa de la sesión", async () => {
    getSessionMock.mockResolvedValue({ ...CLIENT_SESSION, session: { activeOrganizationId: "org-2" } });
    const second = membership("owner", { id: OTHER_BUSINESS_ID });
    second.organizationId = "org-2";
    findMembershipsMock.mockResolvedValue([membership("owner"), second]);

    await app.inject({ method: "GET", url: "/portal/appointments" });

    expect(activity.listAppointments).toHaveBeenCalledWith(OTHER_BUSINESS_ID, expect.anything(), expect.anything());
  });

  it("el equipo no ve métricas ni pagos (solo dueño)", async () => {
    getSessionMock.mockResolvedValue(CLIENT_SESSION);
    findMembershipsMock.mockResolvedValue([membership("member")]);

    const usage = await app.inject({ method: "GET", url: "/portal/usage" });
    const transactions = await app.inject({ method: "GET", url: "/portal/transactions" });

    expect(usage.statusCode).toBe(403);
    expect(transactions.statusCode).toBe(403);
    expect(metrics.getBusinessUsage).not.toHaveBeenCalled();
    expect(activity.listPayments).not.toHaveBeenCalled();
  });

  it("el dueño ve las métricas de su negocio", async () => {
    getSessionMock.mockResolvedValue(CLIENT_SESSION);
    findMembershipsMock.mockResolvedValue([membership("owner")]);

    const response = await app.inject({ method: "GET", url: "/portal/usage?days=7" });

    expect(response.statusCode).toBe(200);
    expect(metrics.getBusinessUsage).toHaveBeenCalledWith(BUSINESS_ID, 7);
  });

  it("un negocio cancelado no entra al portal; uno suspendido sí", async () => {
    getSessionMock.mockResolvedValue(CLIENT_SESSION);

    findMembershipsMock.mockResolvedValue([membership("owner", { status: "CANCELLED" })]);
    const cancelled = await app.inject({ method: "GET", url: "/portal/me" });

    findMembershipsMock.mockResolvedValue([membership("owner", { status: "SUSPENDED" })]);
    const suspended = await app.inject({ method: "GET", url: "/portal/me" });

    expect(cancelled.statusCode).toBe(403);
    expect(suspended.statusCode).toBe(200);
    expect(suspended.json().data.business.status).toBe("SUSPENDED");
  });

  it("GET /portal/customers/:id valida el id y pasa el negocio de la sesión", async () => {
    getSessionMock.mockResolvedValue(CLIENT_SESSION);
    findMembershipsMock.mockResolvedValue([membership("member")]);
    portalService.getCustomer.mockResolvedValue({ id: "c" });

    const bad = await app.inject({ method: "GET", url: "/portal/customers/nope" });
    const ok = await app.inject({ method: "GET", url: `/portal/customers/${OTHER_BUSINESS_ID}` });

    expect(bad.statusCode).toBe(400);
    expect(ok.statusCode).toBe(200);
    expect(portalService.getCustomer).toHaveBeenCalledWith(BUSINESS_ID, OTHER_BUSINESS_ID);
  });

  it("GET /portal/chats/:phone valida el número y usa el negocio de la sesión", async () => {
    getSessionMock.mockResolvedValue(CLIENT_SESSION);
    findMembershipsMock.mockResolvedValue([membership("member")]);
    chats.getChat.mockResolvedValue({ phone: "573001112233", messages: [] });

    const bad = await app.inject({ method: "GET", url: "/portal/chats/abc" });
    const ok = await app.inject({
      method: "GET",
      url: "/portal/chats/573001112233?before=2026-10-03T10:00:00.000Z",
    });

    expect(bad.statusCode).toBe(400);
    expect(ok.statusCode).toBe(200);
    expect(chats.getChat).toHaveBeenCalledWith(BUSINESS_ID, "573001112233", {
      before: "2026-10-03T10:00:00.000Z",
    });
  });
});

describe("acciones sobre citas", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const APPOINTMENT_ID = "33333333-3333-4333-8333-333333333333";

  beforeEach(async () => {
    app = await buildApp();
  });
  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("el equipo puede cancelar; el negocio y el actor salen de la sesión", async () => {
    getSessionMock.mockResolvedValue(CLIENT_SESSION);
    findMembershipsMock.mockResolvedValue([membership("member")]);
    appointmentActions.applyAppointmentAction.mockResolvedValue({ id: APPOINTMENT_ID, status: "CANCELLED" });

    const response = await app.inject({
      method: "POST",
      url: `/portal/appointments/${APPOINTMENT_ID}/actions`,
      payload: { action: "cancel", reason: "Llamó a cancelar", businessId: OTHER_BUSINESS_ID },
    });

    expect(response.statusCode).toBe(200);
    expect(appointmentActions.applyAppointmentAction).toHaveBeenCalledWith(
      BUSINESS_ID,
      APPOINTMENT_ID,
      { action: "cancel", reason: "Llamó a cancelar" },
      "spa@example.com",
    );
  });

  it("cancelar sin motivo o una acción desconocida → 400", async () => {
    getSessionMock.mockResolvedValue(CLIENT_SESSION);
    findMembershipsMock.mockResolvedValue([membership("member")]);

    const noReason = await app.inject({
      method: "POST",
      url: `/portal/appointments/${APPOINTMENT_ID}/actions`,
      payload: { action: "cancel" },
    });
    const unknown = await app.inject({
      method: "POST",
      url: `/portal/appointments/${APPOINTMENT_ID}/actions`,
      payload: { action: "refund" },
    });

    expect(noReason.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(400);
    expect(appointmentActions.applyAppointmentAction).not.toHaveBeenCalled();
  });

  it("el operador usa la ruta de /admin con el negocio de la URL", async () => {
    getSessionMock.mockResolvedValue(OPERATOR_SESSION);
    appointmentActions.applyAppointmentAction.mockResolvedValue({ id: APPOINTMENT_ID, status: "COMPLETED" });

    const response = await app.inject({
      method: "POST",
      url: `/admin/businesses/${BUSINESS_ID}/appointments/${APPOINTMENT_ID}/actions`,
      payload: { action: "complete" },
    });

    expect(response.statusCode).toBe(200);
    expect(appointmentActions.applyAppointmentAction).toHaveBeenCalledWith(
      BUSINESS_ID,
      APPOINTMENT_ID,
      { action: "complete", balancePaid: true },
      "op-1",
    );
  });
});

describe("/admin/businesses/:id/chats — transcripción para el operador", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    getSessionMock.mockResolvedValue(OPERATOR_SESSION);
  });
  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("verifica el negocio y lista con paginación", async () => {
    chats.listChats.mockResolvedValue(EMPTY_PAGE);

    const response = await app.inject({ method: "GET", url: `/admin/businesses/${BUSINESS_ID}/chats?q=maria` });

    expect(response.statusCode).toBe(200);
    expect(chats.assertBusinessExists).toHaveBeenCalledWith(BUSINESS_ID);
    expect(chats.listChats).toHaveBeenCalledWith(BUSINESS_ID, expect.objectContaining({ q: "maria", page: 1 }));
  });

  it("un cliente del portal no ve los chats de /admin (403)", async () => {
    getSessionMock.mockResolvedValue(CLIENT_SESSION);

    const response = await app.inject({ method: "GET", url: `/admin/businesses/${BUSINESS_ID}/chats` });

    expect(response.statusCode).toBe(403);
    expect(chats.listChats).not.toHaveBeenCalled();
  });
});

describe("/admin/businesses/:id/users — usuarios del portal", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    getSessionMock.mockResolvedValue(OPERATOR_SESSION);
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("POST valida el correo", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/admin/businesses/${BUSINESS_ID}/users`,
      payload: { name: "Dueña", email: "no-es-correo" },
    });

    expect(response.statusCode).toBe(400);
    expect(usersService.createBusinessUser).not.toHaveBeenCalled();
  });

  it("POST crea con rol owner por defecto y pasa el actor", async () => {
    usersService.createBusinessUser.mockResolvedValue({ user: { userId: "u" }, temporaryPassword: "x".repeat(16) });

    const response = await app.inject({
      method: "POST",
      url: `/admin/businesses/${BUSINESS_ID}/users`,
      payload: { name: "Dueña", email: "Duena@Spa.com" },
    });

    expect(response.statusCode).toBe(201);
    expect(usersService.createBusinessUser).toHaveBeenCalledWith(
      BUSINESS_ID,
      { name: "Dueña", email: "duena@spa.com", role: "owner" },
      "op-1",
    );
  });

  it("PATCH rechaza un rol desconocido", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/admin/businesses/${BUSINESS_ID}/users/u-1`,
      payload: { role: "operator" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("DELETE responde 204", async () => {
    usersService.removeBusinessUser.mockResolvedValue(undefined);

    const response = await app.inject({ method: "DELETE", url: `/admin/businesses/${BUSINESS_ID}/users/u-1` });

    expect(response.statusCode).toBe(204);
    expect(usersService.removeBusinessUser).toHaveBeenCalledWith(BUSINESS_ID, "u-1", "op-1");
  });
});
