import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock("../../src/auth/better-auth.js", () => ({
  isPanelAuthEnabled: true,
  auth: { api: { getSession: getSessionMock }, handler: vi.fn() },
}));
vi.mock("../../src/db/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) },
}));
vi.mock("../../src/services/admin-billing.service.js", () => ({
  listInvoices: vi.fn(),
  getInvoice: vi.fn(),
  createInvoice: vi.fn(),
  applyInvoiceAction: vi.fn(),
  listPayments: vi.fn(),
  registerPayment: vi.fn(),
  listOutstandingInvoices: vi.fn(),
  getBusinessBillingSummary: vi.fn(),
  generateInvoicePdf: vi.fn(),
  generateReceiptPdf: vi.fn(),
}));
vi.mock("../../src/services/admin-subscription.service.js", () => ({
  getSubscription: vi.fn(),
  upsertSubscription: vi.fn(),
  extendSubscription: vi.fn(),
  suggestedSubscription: vi.fn(() => ({ name: "mensual" })),
}));
vi.mock("../../src/services/billing-cycle.service.js", () => ({ runBillingCycle: vi.fn() }));
vi.mock("../../src/services/admin-metrics.service.js", () => ({
  getOverview: vi.fn(),
  getBusinessUsage: vi.fn(),
}));
vi.mock("../../src/services/admin-activity.service.js", () => ({
  listAppointments: vi.fn(),
  listPayments: vi.fn(),
  listConversations: vi.fn(),
  listGiftCards: vi.fn(),
}));
vi.mock("../../src/services/admin-audit.service.js", () => ({ listAuditLogs: vi.fn() }));
vi.mock("../../src/services/admin-status.service.js", () => ({ changeBusinessStatus: vi.fn() }));
vi.mock("../../src/services/admin-whatsapp.service.js", () => ({
  listWhatsAppAccounts: vi.fn(),
  connectWhatsAppAccount: vi.fn(),
  updateWhatsAppAccount: vi.fn(),
  disconnectWhatsAppAccount: vi.fn(),
  verifyWhatsAppAccount: vi.fn(),
}));
vi.mock("../../src/services/admin-payment-credentials.service.js", () => ({
  getPaymentCredentials: vi.fn(),
  upsertPaymentCredentials: vi.fn(),
  deletePaymentCredentials: vi.fn(),
}));

const { buildApp } = await import("../../src/app.js");
const billing = await import("../../src/services/admin-billing.service.js");
const subscription = await import("../../src/services/admin-subscription.service.js");
const metrics = await import("../../src/services/admin-metrics.service.js");
const activity = await import("../../src/services/admin-activity.service.js");
const status = await import("../../src/services/admin-status.service.js");
const whatsapp = await import("../../src/services/admin-whatsapp.service.js");
const credentials = await import("../../src/services/admin-payment-credentials.service.js");

const SESSION = { user: { id: "op-1", email: "op@example.com", role: "operator" }, session: { activeOrganizationId: null } };
const BID = "11111111-1111-1111-1111-111111111111";
const AID = "22222222-2222-2222-2222-222222222222";

describe("/admin/* — cartera, métricas e integraciones", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    getSessionMock.mockResolvedValue(SESSION);
  });
  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("todas las rutas nuevas exigen sesión", async () => {
    getSessionMock.mockResolvedValue(null);
    for (const url of [
      "/admin/metrics/overview",
      "/admin/invoices",
      "/admin/payments",
      "/admin/audit-logs",
      `/admin/businesses/${BID}/usage`,
      `/admin/businesses/${BID}/whatsapp`,
    ]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(401);
    }
  });

  it("GET /admin/metrics/overview acepta la ventana en días", async () => {
    vi.mocked(metrics.getOverview).mockResolvedValue({ clients: { total: 3 } } as never);
    const res = await app.inject({ method: "GET", url: "/admin/metrics/overview?days=7" });
    expect(res.statusCode).toBe(200);
    expect(metrics.getOverview).toHaveBeenCalledWith(7);
  });

  it("GET usage usa 30 días por defecto", async () => {
    vi.mocked(metrics.getBusinessUsage).mockResolvedValue({ businessId: BID } as never);
    const res = await app.inject({ method: "GET", url: `/admin/businesses/${BID}/usage` });
    expect(res.statusCode).toBe(200);
    expect(metrics.getBusinessUsage).toHaveBeenCalledWith(BID, 30);
  });

  it("GET subscription devuelve sugerencia cuando no hay plan", async () => {
    vi.mocked(subscription.getSubscription).mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: `/admin/businesses/${BID}/subscription` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.plan).toBeNull();
    expect(res.json().data.suggested).toEqual({ name: "mensual" });
  });

  it("PUT subscription valida el cuerpo", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/admin/businesses/${BID}/subscription`,
      payload: { price: 50000, validUntil: "02/10/2026" },
    });
    expect(res.statusCode).toBe(400);
    expect(subscription.upsertSubscription).not.toHaveBeenCalled();
  });

  it("POST invoices responde 201", async () => {
    vi.mocked(billing.createInvoice).mockResolvedValue({ id: "inv-1", number: "CC-2026-001" } as never);
    const res = await app.inject({ method: "POST", url: `/admin/businesses/${BID}/invoices`, payload: {} });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.number).toBe("CC-2026-001");
  });

  it("POST payments responde 201 y pasa el actor de la sesión", async () => {
    vi.mocked(billing.registerPayment).mockResolvedValue({ reactivated: true } as never);
    const res = await app.inject({
      method: "POST",
      url: `/admin/businesses/${BID}/payments`,
      payload: { paidAt: "2026-09-08", amount: 50000, method: "Nequi" },
    });
    expect(res.statusCode).toBe(201);
    expect(billing.registerPayment).toHaveBeenCalledWith(BID, expect.anything(), "op-1");
  });

  it("GET /admin/invoices pasa filtros y paginación", async () => {
    vi.mocked(billing.listInvoices).mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
    const res = await app.inject({ method: "GET", url: "/admin/invoices?status=OVERDUE&page=2" });
    expect(res.statusCode).toBe(200);
    expect(billing.listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 }),
      expect.objectContaining({ status: "OVERDUE" }),
    );
  });

  it("POST status exige motivo", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/businesses/${BID}/status`,
      payload: { status: "SUSPENDED" },
    });
    expect(res.statusCode).toBe(400);
    expect(status.changeBusinessStatus).not.toHaveBeenCalled();
  });

  it("POST status suspende con motivo", async () => {
    vi.mocked(status.changeBusinessStatus).mockResolvedValue({ id: BID, status: "SUSPENDED" } as never);
    const res = await app.inject({
      method: "POST",
      url: `/admin/businesses/${BID}/status`,
      payload: { status: "SUSPENDED", reason: "mora de 2 meses" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("POST whatsapp valida los ids de Meta", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/businesses/${BID}/whatsapp`,
      payload: { wabaId: "no-numerico", phoneNumberId: "123456789012345", accessToken: "x".repeat(40) },
    });
    expect(res.statusCode).toBe(400);
    expect(whatsapp.connectWhatsAppAccount).not.toHaveBeenCalled();
  });

  it("POST whatsapp conecta un número válido", async () => {
    vi.mocked(whatsapp.connectWhatsAppAccount).mockResolvedValue({ id: AID } as never);
    const res = await app.inject({
      method: "POST",
      url: `/admin/businesses/${BID}/whatsapp`,
      payload: {
        wabaId: "123456789012345",
        phoneNumberId: "987654321098765",
        accessToken: "x".repeat(40),
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("DELETE whatsapp responde 204", async () => {
    vi.mocked(whatsapp.disconnectWhatsAppAccount).mockResolvedValue(undefined);
    const res = await app.inject({
      method: "DELETE",
      url: `/admin/businesses/${BID}/whatsapp/${AID}`,
    });
    expect(res.statusCode).toBe(204);
  });

  it("PUT payment-credentials rechaza llaves incompletas", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/admin/businesses/${BID}/payment-credentials`,
      payload: { apiKey: "corta", publicKey: "x".repeat(20), integritySecret: "x".repeat(20), webhookSecret: "x".repeat(20) },
    });
    expect(res.statusCode).toBe(400);
    expect(credentials.upsertPaymentCredentials).not.toHaveBeenCalled();
  });

  it("GET appointments pasa el rango de fechas", async () => {
    vi.mocked(activity.listAppointments).mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
    const res = await app.inject({
      method: "GET",
      url: `/admin/businesses/${BID}/appointments?from=2026-09-01&to=2026-09-30`,
    });
    expect(res.statusCode).toBe(200);
    expect(activity.listAppointments).toHaveBeenCalledWith(
      BID,
      expect.anything(),
      expect.objectContaining({ from: "2026-09-01", to: "2026-09-30" }),
    );
  });
});
