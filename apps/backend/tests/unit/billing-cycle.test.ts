import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/subscriptionPlan.repository.js", () => ({
  subscriptionPlanRepository: { listWithBusiness: vi.fn() },
}));
vi.mock("../../src/repositories/operatorBilling.repository.js", () => ({
  operatorBillingRepository: {
    findOverlapping: vi.fn().mockResolvedValue(null),
    findDueForOverdue: vi.fn().mockResolvedValue([]),
    markOverdue: vi.fn().mockResolvedValue({ count: 0 }),
  },
}));
vi.mock("../../src/repositories/adminBusiness.repository.js", () => ({
  adminBusinessRepository: { findDetail: vi.fn(), updateStatus: vi.fn() },
}));
vi.mock("../../src/repositories/auditLog.repository.js", () => ({
  auditLogRepository: { record: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../src/services/admin-billing.service.js", () => ({ createInvoice: vi.fn() }));

const { subscriptionPlanRepository } = await import("../../src/repositories/subscriptionPlan.repository.js");
const { operatorBillingRepository } = await import("../../src/repositories/operatorBilling.repository.js");
const { adminBusinessRepository } = await import("../../src/repositories/adminBusiness.repository.js");
const { createInvoice } = await import("../../src/services/admin-billing.service.js");
const { runBillingCycle } = await import("../../src/services/billing-cycle.service.js");

const BID = "11111111-1111-1111-1111-111111111111";
const TODAY = "2026-09-08";

function planRow(overrides: Record<string, unknown> = {}, businessOverrides: Record<string, unknown> = {}) {
  return {
    businessId: BID,
    name: "mensual",
    price: 50000,
    currency: "COP",
    cycle: "MONTHLY",
    graceDays: 3,
    validUntil: new Date("2026-10-02T00:00:00Z"),
    business: { id: BID, name: "Spa Demo", slug: "spa-demo", status: "ACTIVE", ...businessOverrides },
    ...overrides,
  } as never;
}

describe("billing-cycle.service", () => {
  beforeEach(() => {
    // `clearAllMocks` limpia llamadas pero no implementaciones: sin resembrar
    // los defaults aquí, un `mockResolvedValue` de un test se filtra al siguiente.
    vi.mocked(createInvoice).mockResolvedValue({ number: "CC-2026-001", dueAt: "2026-10-02" } as never);
    vi.mocked(operatorBillingRepository.findOverlapping).mockResolvedValue(null);
    vi.mocked(operatorBillingRepository.findDueForOverdue).mockResolvedValue([]);
    vi.mocked(operatorBillingRepository.markOverdue).mockResolvedValue({ count: 0 } as never);
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(null);
    vi.mocked(adminBusinessRepository.updateStatus).mockResolvedValue({} as never);
  });
  afterEach(() => vi.clearAllMocks());

  it("no emite nada si falta más que la ventana de anticipación", async () => {
    vi.mocked(subscriptionPlanRepository.listWithBusiness).mockResolvedValue([planRow()]);

    const result = await runBillingCycle(TODAY);

    expect(result.invoicesCreated).toBe(0);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("emite la cuenta del próximo período dentro de la ventana", async () => {
    vi.mocked(subscriptionPlanRepository.listWithBusiness).mockResolvedValue([
      planRow({ validUntil: new Date("2026-09-11T00:00:00Z") }),
    ]);

    const result = await runBillingCycle(TODAY);

    expect(result.invoicesCreated).toBe(1);
    expect(createInvoice).toHaveBeenCalledWith(
      BID,
      expect.objectContaining({ periodFrom: "2026-09-11", periodTo: "2026-10-11", send: true }),
      "system",
    );
  });

  it("no duplica la cuenta si ya existe una para ese período", async () => {
    vi.mocked(subscriptionPlanRepository.listWithBusiness).mockResolvedValue([
      planRow({ validUntil: new Date("2026-09-11T00:00:00Z") }),
    ]);
    vi.mocked(operatorBillingRepository.findOverlapping).mockResolvedValue({ id: "inv-1" } as never);

    const result = await runBillingCycle(TODAY);

    expect(result.invoicesCreated).toBe(0);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("no le sigue acumulando deuda a un negocio suspendido", async () => {
    vi.mocked(subscriptionPlanRepository.listWithBusiness).mockResolvedValue([
      planRow({ validUntil: new Date("2026-09-01T00:00:00Z") }, { status: "SUSPENDED" }),
    ]);

    const result = await runBillingCycle(TODAY);

    expect(result.invoicesCreated).toBe(0);
  });

  it("marca vencidas las cuentas y pasa el negocio a mora", async () => {
    vi.mocked(subscriptionPlanRepository.listWithBusiness).mockResolvedValue([]);
    vi.mocked(operatorBillingRepository.findDueForOverdue).mockResolvedValue([
      { id: "inv-1", businessId: BID },
    ] as never);
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({
      id: BID,
      name: "Spa Demo",
      status: "ACTIVE",
    } as never);

    const result = await runBillingCycle(TODAY);

    expect(result.invoicesOverdue).toBe(1);
    expect(result.businessesPastDue).toBe(1);
    expect(adminBusinessRepository.updateStatus).toHaveBeenCalledWith(BID, "PAST_DUE");
  });

  it("suspende al agotarse la gracia", async () => {
    // Venció el 2026-09-01 con 3 días de gracia → el 2026-09-08 ya está fuera.
    vi.mocked(subscriptionPlanRepository.listWithBusiness).mockResolvedValue([
      planRow({ validUntil: new Date("2026-09-01T00:00:00Z") }, { status: "PAST_DUE" }),
    ]);
    vi.mocked(operatorBillingRepository.findOverlapping).mockResolvedValue({ id: "inv-1" } as never);

    const result = await runBillingCycle(TODAY);

    expect(result.businessesSuspended).toBe(1);
    expect(adminBusinessRepository.updateStatus).toHaveBeenCalledWith(BID, "SUSPENDED");
  });

  it("todavía no suspende dentro de los días de gracia", async () => {
    vi.mocked(subscriptionPlanRepository.listWithBusiness).mockResolvedValue([
      planRow({ validUntil: new Date("2026-09-06T00:00:00Z") }, { status: "PAST_DUE" }),
    ]);
    vi.mocked(operatorBillingRepository.findOverlapping).mockResolvedValue({ id: "inv-1" } as never);

    const result = await runBillingCycle(TODAY);

    expect(result.businessesSuspended).toBe(0);
  });

  it("una prueba vencida cae a mora, no directo a suspensión", async () => {
    vi.mocked(subscriptionPlanRepository.listWithBusiness).mockResolvedValue([
      planRow({ validUntil: new Date("2026-09-01T00:00:00Z") }, { status: "TRIAL" }),
    ]);
    vi.mocked(operatorBillingRepository.findOverlapping).mockResolvedValue({ id: "inv-1" } as never);

    const result = await runBillingCycle(TODAY);

    expect(result.businessesPastDue).toBe(1);
    expect(result.businessesSuspended).toBe(0);
    expect(adminBusinessRepository.updateStatus).toHaveBeenCalledWith(BID, "PAST_DUE");
  });

  it("un negocio que pasa a mora hoy no se suspende mientras le quede gracia", async () => {
    vi.mocked(subscriptionPlanRepository.listWithBusiness).mockResolvedValue([
      planRow({ validUntil: new Date("2026-09-07T00:00:00Z") }, { status: "ACTIVE" }),
    ]);
    vi.mocked(operatorBillingRepository.findOverlapping).mockResolvedValue({ id: "inv-1" } as never);
    vi.mocked(operatorBillingRepository.findDueForOverdue).mockResolvedValue([
      { id: "inv-1", businessId: BID },
    ] as never);
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({
      id: BID,
      name: "Spa Demo",
      status: "ACTIVE",
    } as never);

    const result = await runBillingCycle(TODAY);

    expect(result.businessesPastDue).toBe(1);
    expect(result.businessesSuspended).toBe(0);
  });
});
