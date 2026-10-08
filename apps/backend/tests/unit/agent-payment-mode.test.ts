import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/business.repository.js", () => ({
  businessRepository: { findById: vi.fn() },
}));
vi.mock("../../src/services/business-guard.js", () => ({ assertBusinessOperational: vi.fn() }));
vi.mock("../../src/services/appointment.service.js", () => ({ createAppointment: vi.fn() }));
vi.mock("../../src/services/payment.service.js", () => ({ createPayment: vi.fn() }));
vi.mock("../../src/services/notification.service.js", () => ({
  notifyAppointmentConfirmed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/services/availability.service.js", () => ({ getAvailability: vi.fn() }));
vi.mock("../../src/services/whatsapp-provider-resolver.js", () => ({ resolveWhatsAppProviderForBusiness: vi.fn() }));
vi.mock("../../src/repositories/service.repository.js", () => ({ serviceRepository: {} }));
vi.mock("../../src/repositories/appointment.repository.js", () => ({ appointmentRepository: {} }));

const { businessRepository } = await import("../../src/repositories/business.repository.js");
const { createAppointment } = await import("../../src/services/appointment.service.js");
const { createPayment } = await import("../../src/services/payment.service.js");
const { notifyAppointmentConfirmed } = await import("../../src/services/notification.service.js");
const { createAgentAppointment } = await import("../../src/services/agent.service.js");
const { createAgentAppointmentSchema } = await import("../../src/validators/agent.validator.js");
const { AvailabilityError } = await import("../../src/errors/index.js");

const input = {
  businessId: "f07de9b2-7f40-4b15-9f9f-baf78f569e01",
  serviceId: "ffe47798-1042-4261-9dbc-214698a93a3d",
  date: "2026-10-09",
  startTime: "16:00",
  customerName: "Ana Castillo",
  customerPhone: "573224379399",
};

function business(overrides: Record<string, unknown> = {}) {
  return { id: input.businessId, chargeMode: "TOTAL", depositPercentage: null, settings: {}, ...overrides } as never;
}

const appointment = {
  id: "apt-1",
  appointmentCode: "APT-TEST1234",
  appointmentDate: new Date("2026-10-09T00:00:00Z"),
  startTime: "16:00",
  endTime: "17:00",
  price: "70000",
  service: { name: "Tratamiento capilar hidratante" },
};

describe("createAgentAppointment · forma de pago", () => {
  beforeEach(() => {
    vi.mocked(createAppointment).mockResolvedValue(appointment as never);
    vi.mocked(createPayment).mockResolvedValue({
      paymentUrl: "https://pay/x",
      reference: "PAY-1",
      chargeMode: "TOTAL",
      amount: 70000,
      pendingBalance: null,
    });
  });
  afterEach(() => vi.clearAllMocks());

  it("local: cita confirmada sin link y aviso solo al negocio", async () => {
    vi.mocked(businessRepository.findById).mockResolvedValue(business({ settings: { allowPayAtVenue: true } }));

    const result = await createAgentAppointment({ ...input, paymentMode: "local" });

    expect(result).toMatchObject({ creada: true, modoCobro: "en_local", saldoPendiente: 70000, inicio: "4:00 p. m." });
    expect(result).not.toHaveProperty("linkPago");
    expect(createAppointment).toHaveBeenCalledWith(expect.objectContaining({ payAtVenue: true }));
    expect(createPayment).not.toHaveBeenCalled();
    expect(notifyAppointmentConfirmed).toHaveBeenCalledWith("apt-1", { notifyCustomer: false });
  });

  it("local en un negocio que no lo permite: rechaza sin crear la cita", async () => {
    vi.mocked(businessRepository.findById).mockResolvedValue(business());

    const result = await createAgentAppointment({ ...input, paymentMode: "local" });

    expect(result).toMatchObject({ creada: false });
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("abono en un negocio sin abono: rechaza sin crear la cita", async () => {
    vi.mocked(businessRepository.findById).mockResolvedValue(business({ chargeMode: "DEPOSIT", depositPercentage: 100 }));

    const result = await createAgentAppointment({ ...input, paymentMode: "abono" });

    expect(result).toMatchObject({ creada: false });
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("abono: pide el link por el abono", async () => {
    vi.mocked(businessRepository.findById).mockResolvedValue(business({ chargeMode: "DEPOSIT", depositPercentage: 30 }));
    vi.mocked(createPayment).mockResolvedValue({
      paymentUrl: "https://pay/x",
      reference: "PAY-1",
      chargeMode: "DEPOSIT",
      amount: 21000,
      pendingBalance: 49000,
    });

    const result = await createAgentAppointment({ ...input, paymentMode: "abono" });

    expect(createPayment).toHaveBeenCalledWith({ entityType: "APPOINTMENT", entityId: "apt-1", chargeMode: "DEPOSIT" });
    expect(result).toMatchObject({ creada: true, modoCobro: "abono", montoLink: 21000, saldoPendiente: 49000 });
  });

  it("total en un negocio con abono: fuerza el link por el total", async () => {
    vi.mocked(businessRepository.findById).mockResolvedValue(business({ chargeMode: "DEPOSIT", depositPercentage: 30 }));

    await createAgentAppointment({ ...input, paymentMode: "total" });

    expect(createPayment).toHaveBeenCalledWith({ entityType: "APPOINTMENT", entityId: "apt-1", chargeMode: "TOTAL" });
  });

  it("sin forma de pago: cobra según el negocio, como antes", async () => {
    vi.mocked(businessRepository.findById).mockResolvedValue(business());

    const result = await createAgentAppointment(input);

    expect(createAppointment).toHaveBeenCalledWith(expect.objectContaining({ payAtVenue: false }));
    expect(createPayment).toHaveBeenCalledWith({ entityType: "APPOINTMENT", entityId: "apt-1", chargeMode: undefined });
    expect(result).toMatchObject({ creada: true, modoCobro: "total", linkPago: "https://pay/x", minutosParaPagar: 15 });
  });

  it("un cupo ocupado sigue siendo creada:false", async () => {
    vi.mocked(businessRepository.findById).mockResolvedValue(business({ settings: { allowPayAtVenue: true } }));
    vi.mocked(createAppointment).mockRejectedValue(new AvailabilityError("Ese horario ya no está disponible."));

    const result = await createAgentAppointment({ ...input, paymentMode: "local" });

    expect(result).toEqual({ creada: false, motivo: "Ese horario ya no está disponible." });
  });
});

describe("createAgentAppointmentSchema.paymentMode", () => {
  it.each([
    ["local", "local"],
    [" Abono ", "abono"],
    ["", undefined],
    [undefined, undefined],
  ])("%j → %j", (value, expected) => {
    expect(createAgentAppointmentSchema.parse({ ...input, paymentMode: value }).paymentMode).toBe(expected);
  });

  it("rechaza una forma de pago desconocida", () => {
    expect(createAgentAppointmentSchema.safeParse({ ...input, paymentMode: "tarjeta" }).success).toBe(false);
  });
});
