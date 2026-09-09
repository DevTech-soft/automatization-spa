import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/subscriptionPlan.repository.js", () => ({
  subscriptionPlanRepository: { findByBusinessId: vi.fn(), upsert: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/repositories/adminBusiness.repository.js", () => ({
  adminBusinessRepository: { findDetail: vi.fn() },
}));
vi.mock("../../src/repositories/auditLog.repository.js", () => ({
  auditLogRepository: { record: vi.fn().mockResolvedValue(undefined) },
}));

const { subscriptionPlanRepository } = await import("../../src/repositories/subscriptionPlan.repository.js");
const { adminBusinessRepository } = await import("../../src/repositories/adminBusiness.repository.js");
const { getSubscription, extendSubscription, suggestedSubscription } = await import(
  "../../src/services/admin-subscription.service.js"
);
const { NotFoundError } = await import("../../src/errors/index.js");

const BID = "11111111-1111-1111-1111-111111111111";

function plan(validUntil: string, overrides: Record<string, unknown> = {}) {
  return {
    businessId: BID,
    name: "mensual",
    price: 50000,
    currency: "COP",
    cycle: "MONTHLY",
    validUntil: new Date(`${validUntil}T00:00:00Z`),
    graceDays: 3,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  } as never;
}

describe("admin-subscription.service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mediodía en Bogotá: la fecha del operador es 2026-09-08 sin ambigüedad.
    vi.setSystemTime(new Date("2026-09-08T17:00:00Z"));
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({ id: BID, name: "Spa" } as never);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("calcula días restantes y vencimiento", async () => {
    vi.mocked(subscriptionPlanRepository.findByBusinessId).mockResolvedValue(plan("2026-09-12"));

    const dto = await getSubscription(BID);

    expect(dto?.daysRemaining).toBe(4);
    expect(dto?.expired).toBe(false);
    expect(dto?.graceExpired).toBe(false);
  });

  it("marca gracia agotada cuando pasaron más días que la gracia", async () => {
    vi.mocked(subscriptionPlanRepository.findByBusinessId).mockResolvedValue(plan("2026-09-01"));

    const dto = await getSubscription(BID);

    expect(dto?.daysRemaining).toBe(-7);
    expect(dto?.expired).toBe(true);
    expect(dto?.graceExpired).toBe(true);
  });

  it("dentro de la gracia sigue sin estar agotada", async () => {
    vi.mocked(subscriptionPlanRepository.findByBusinessId).mockResolvedValue(plan("2026-09-06"));

    const dto = await getSubscription(BID);

    expect(dto?.expired).toBe(true);
    expect(dto?.graceExpired).toBe(false);
  });

  it("sugiere el plan por defecto con la prueba de 7 días", () => {
    const suggested = suggestedSubscription();

    expect(suggested.price).toBe(50000);
    expect(suggested.graceDays).toBe(3);
    expect(suggested.validUntil).toBe("2026-09-15");
  });

  it("extender sobre un plan vigente suma desde la vigencia actual", async () => {
    vi.mocked(subscriptionPlanRepository.findByBusinessId).mockResolvedValue(plan("2026-09-20"));
    vi.mocked(subscriptionPlanRepository.update).mockResolvedValue(plan("2026-09-27"));

    await extendSubscription(BID, { days: 7 }, "op-1");

    const written = vi.mocked(subscriptionPlanRepository.update).mock.calls[0]![1];
    expect((written.validUntil as Date).toISOString().slice(0, 10)).toBe("2026-09-27");
  });

  it("extender un plan vencido cuenta desde hoy, no desde la fecha pasada", async () => {
    vi.mocked(subscriptionPlanRepository.findByBusinessId).mockResolvedValue(plan("2026-08-01"));
    vi.mocked(subscriptionPlanRepository.update).mockResolvedValue(plan("2026-09-15"));

    await extendSubscription(BID, { days: 7 }, "op-1");

    const written = vi.mocked(subscriptionPlanRepository.update).mock.calls[0]![1];
    expect((written.validUntil as Date).toISOString().slice(0, 10)).toBe("2026-09-15");
  });

  it("no extiende un negocio sin plan", async () => {
    vi.mocked(subscriptionPlanRepository.findByBusinessId).mockResolvedValue(null);
    await expect(extendSubscription(BID, { days: 7 }, "op-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});
