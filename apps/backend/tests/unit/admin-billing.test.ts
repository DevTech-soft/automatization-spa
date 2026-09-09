import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/operatorBilling.repository.js", () => ({
  operatorBillingRepository: {
    listInvoices: vi.fn(),
    findInvoice: vi.fn(),
    createInvoice: vi.fn(),
    updateInvoiceStatus: vi.fn(),
    findOutstandingByBusiness: vi.fn().mockResolvedValue([]),
    listPayments: vi.fn(),
    findPayment: vi.fn(),
    registerPayment: vi.fn(),
    setInvoicePdf: vi.fn(),
    setPaymentPdf: vi.fn(),
  },
}));
vi.mock("../../src/repositories/adminBusiness.repository.js", () => ({
  adminBusinessRepository: { findDetail: vi.fn(), updateStatus: vi.fn() },
}));
vi.mock("../../src/repositories/subscriptionPlan.repository.js", () => ({
  subscriptionPlanRepository: { findByBusinessId: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/repositories/auditLog.repository.js", () => ({
  auditLogRepository: { record: vi.fn().mockResolvedValue(undefined) },
}));

const { operatorBillingRepository } = await import("../../src/repositories/operatorBilling.repository.js");
const { adminBusinessRepository } = await import("../../src/repositories/adminBusiness.repository.js");
const { subscriptionPlanRepository } = await import("../../src/repositories/subscriptionPlan.repository.js");
const { createInvoice, registerPayment, applyInvoiceAction } = await import(
  "../../src/services/admin-billing.service.js"
);
const { ValidationError, NotFoundError } = await import("../../src/errors/index.js");

const BID = "11111111-1111-1111-1111-111111111111";
const TODAY = "2026-09-08";

function business(overrides: Record<string, unknown> = {}) {
  return { id: BID, name: "Spa Demo", currency: "COP", status: "ACTIVE", address: null, email: null, ...overrides } as never;
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    businessId: BID,
    name: "mensual",
    price: 50000,
    currency: "COP",
    cycle: "MONTHLY",
    validUntil: new Date("2026-10-02T00:00:00Z"),
    graceDays: 3,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  } as never;
}

/** Fila tal como la devuelve el repositorio tras crear/leer una cuenta de cobro. */
function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    number: "CC-2026-001",
    businessId: BID,
    issuedAt: new Date("2026-09-08T00:00:00Z"),
    dueAt: new Date("2026-10-02T00:00:00Z"),
    periodFrom: new Date("2026-10-02T00:00:00Z"),
    periodTo: new Date("2026-11-01T00:00:00Z"),
    items: [{ concept: "Plan mensual", period: "2 oct – 1 nov 2026", amount: 50000 }],
    subtotal: 50000,
    taxes: 0,
    total: 50000,
    currency: "COP",
    status: "DRAFT",
    pdfUrl: null,
    createdAt: new Date("2026-09-08T00:00:00Z"),
    business: { id: BID, name: "Spa Demo", slug: "spa-demo", status: "ACTIVE" },
    payments: [],
    ...overrides,
  } as never;
}

describe("admin-billing.service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("createInvoice", () => {
    it("arma la línea desde el plan y cobra el ciclo siguiente", async () => {
      vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(business());
      vi.mocked(subscriptionPlanRepository.findByBusinessId).mockResolvedValue(plan());
      vi.mocked(operatorBillingRepository.createInvoice).mockResolvedValue(invoiceRow());

      const invoice = await createInvoice(BID, {}, "op-1");

      const sent = vi.mocked(operatorBillingRepository.createInvoice).mock.calls[0]![0];
      // El período arranca donde termina la vigencia actual: es el ciclo que se cobra.
      expect(sent.periodFrom.toISOString().slice(0, 10)).toBe("2026-10-02");
      expect(sent.periodTo.toISOString().slice(0, 10)).toBe("2026-11-01");
      expect(sent.total).toBe(50000);
      expect(sent.status).toBe("DRAFT");
      expect(invoice.number).toBe("CC-2026-001");
    });

    it("emite como SENT cuando se pide send", async () => {
      vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(business());
      vi.mocked(subscriptionPlanRepository.findByBusinessId).mockResolvedValue(plan());
      vi.mocked(operatorBillingRepository.createInvoice).mockResolvedValue(invoiceRow({ status: "SENT" }));

      await createInvoice(BID, { send: true }, "op-1");

      expect(vi.mocked(operatorBillingRepository.createInvoice).mock.calls[0]![0].status).toBe("SENT");
    });

    it("sin plan y sin líneas manuales, no adivina el monto", async () => {
      vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(business());
      vi.mocked(subscriptionPlanRepository.findByBusinessId).mockResolvedValue(null);

      await expect(createInvoice(BID, {}, "op-1")).rejects.toBeInstanceOf(ValidationError);
      expect(operatorBillingRepository.createInvoice).not.toHaveBeenCalled();
    });

    it("acepta líneas manuales sin plan", async () => {
      vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(business());
      vi.mocked(subscriptionPlanRepository.findByBusinessId).mockResolvedValue(null);
      vi.mocked(operatorBillingRepository.createInvoice).mockResolvedValue(invoiceRow({ total: 80000 }));

      await createInvoice(BID, { items: [{ concept: "Configuración inicial", amount: 80000 }] }, "op-1");

      expect(vi.mocked(operatorBillingRepository.createInvoice).mock.calls[0]![0].total).toBe(80000);
    });

    it("rechaza un negocio inexistente", async () => {
      vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(null);
      await expect(createInvoice(BID, {}, "op-1")).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("applyInvoiceAction", () => {
    it("no permite anular una cuenta ya pagada", async () => {
      vi.mocked(operatorBillingRepository.findInvoice).mockResolvedValue(invoiceRow({ status: "PAID" }));
      await expect(applyInvoiceAction("inv-1", { action: "void" }, "op-1")).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it("solo envía cuentas en borrador", async () => {
      vi.mocked(operatorBillingRepository.findInvoice).mockResolvedValue(invoiceRow({ status: "OVERDUE" }));
      await expect(applyInvoiceAction("inv-1", { action: "send" }, "op-1")).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });

  describe("registerPayment", () => {
    function paymentRow() {
      return {
        id: "pay-1",
        businessId: BID,
        paidAt: new Date("2026-09-08T00:00:00Z"),
        amount: 50000,
        currency: "COP",
        method: "Nequi",
        reference: null,
        pdfUrl: null,
        business: { id: BID, name: "Spa Demo", slug: "spa-demo", status: "ACTIVE" },
        invoices: [],
      } as never;
    }

    it("extiende la vigencia un ciclo y reactiva un negocio suspendido", async () => {
      vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(business({ status: "SUSPENDED" }));
      vi.mocked(subscriptionPlanRepository.findByBusinessId).mockResolvedValue(
        plan({ validUntil: new Date("2026-09-02T00:00:00Z") }),
      );
      vi.mocked(operatorBillingRepository.registerPayment).mockImplementation(
        async (_data, extra) => {
          await extra?.({} as never);
          return paymentRow();
        },
      );

      const result = await registerPayment(
        BID,
        { paidAt: TODAY, amount: 50000, method: "Nequi", invoiceIds: [] },
        "op-1",
      );

      expect(result.validUntil).toBe("2026-10-02");
      expect(result.reactivated).toBe(true);
      expect(adminBusinessRepository.updateStatus).toHaveBeenCalledWith(BID, "ACTIVE", expect.anything());
    });

    it("ancla la vigencia a hoy cuando el atraso es de varios ciclos", async () => {
      vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(business({ status: "SUSPENDED" }));
      vi.mocked(subscriptionPlanRepository.findByBusinessId).mockResolvedValue(
        plan({ validUntil: new Date("2026-05-01T00:00:00Z") }),
      );
      vi.mocked(operatorBillingRepository.registerPayment).mockImplementation(async (_data, extra) => {
        await extra?.({} as never);
        return paymentRow();
      });

      const result = await registerPayment(
        BID,
        { paidAt: TODAY, amount: 50000, method: "Nequi", invoiceIds: [] },
        "op-1",
      );

      // 2026-05-01 + 30 días sigue en el pasado → se ancla a hoy + 30.
      expect(result.validUntil).toBe("2026-10-08");
      expect(result.reactivated).toBe(true);
    });

    it("no reactiva un negocio en prueba", async () => {
      vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(business({ status: "TRIAL" }));
      vi.mocked(subscriptionPlanRepository.findByBusinessId).mockResolvedValue(plan());
      vi.mocked(operatorBillingRepository.registerPayment).mockImplementation(async (_data, extra) => {
        await extra?.({} as never);
        return paymentRow();
      });

      const result = await registerPayment(
        BID,
        { paidAt: TODAY, amount: 50000, method: "Nequi", invoiceIds: [] },
        "op-1",
      );

      expect(result.reactivated).toBe(false);
      expect(adminBusinessRepository.updateStatus).not.toHaveBeenCalled();
    });

    it("rechaza saldar una cuenta que no está pendiente para ese negocio", async () => {
      vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(business());
      vi.mocked(subscriptionPlanRepository.findByBusinessId).mockResolvedValue(plan());
      vi.mocked(operatorBillingRepository.findOutstandingByBusiness).mockResolvedValue([
        { id: "inv-otra" },
      ] as never);

      await expect(
        registerPayment(
          BID,
          { paidAt: TODAY, amount: 50000, method: "Nequi", invoiceIds: ["inv-ajena"] },
          "op-1",
        ),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(operatorBillingRepository.registerPayment).not.toHaveBeenCalled();
    });
  });
});
