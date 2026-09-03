import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/appointment.repository.js", () => ({
  appointmentRepository: {
    findById: vi.fn(),
    setPaymentReference: vi.fn(),
    confirmIfPending: vi.fn(),
    markPaymentConflict: vi.fn(),
  },
}));
vi.mock("../../src/repositories/business.repository.js", () => ({
  businessRepository: { findById: vi.fn() },
}));
vi.mock("../../src/repositories/payment.repository.js", () => ({
  paymentRepository: { create: vi.fn(), findByReference: vi.fn(), updateStatus: vi.fn() },
}));
vi.mock("../../src/repositories/giftCard.repository.js", () => ({
  giftCardRepository: { findById: vi.fn(), setPaymentReference: vi.fn() },
}));
vi.mock("../../src/integrations/payments/index.js", () => ({
  getPaymentProvider: vi.fn(),
}));
vi.mock("../../src/services/notification.service.js", () => ({
  notifyAppointmentConfirmed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/services/google-sheets-sync.service.js", () => ({
  syncAppointmentToSheet: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/services/gift-card.service.js", () => ({
  confirmGiftCardPayment: vi.fn(),
  finalizeGiftCardAfterPayment: vi.fn().mockResolvedValue(undefined),
}));
// vi.hoisted: necesario para poder capturar las llamadas al lock desde los
// tests (sección 9/12 — confirmar que el webhook sí serializa contra
// reprocesos y contra la capacity, no solo que confirma la reserva).
const { executeRawMock } = vi.hoisted(() => ({ executeRawMock: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/db/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: { $executeRaw: typeof executeRawMock }) => unknown) => {
      return callback({ $executeRaw: executeRawMock });
    }),
  },
}));

const { appointmentRepository } = await import("../../src/repositories/appointment.repository.js");
const { businessRepository } = await import("../../src/repositories/business.repository.js");
const { paymentRepository } = await import("../../src/repositories/payment.repository.js");
const { giftCardRepository } = await import("../../src/repositories/giftCard.repository.js");
const { getPaymentProvider } = await import("../../src/integrations/payments/index.js");
const { notifyAppointmentConfirmed } = await import("../../src/services/notification.service.js");
const { syncAppointmentToSheet } = await import("../../src/services/google-sheets-sync.service.js");
const { confirmGiftCardPayment, finalizeGiftCardAfterPayment } = await import(
  "../../src/services/gift-card.service.js"
);
const { createPayment, processPaymentWebhook } = await import("../../src/services/payment.service.js");
const { NotFoundError, PaymentError, ValidationError, WebhookVerificationError } = await import(
  "../../src/errors/index.js"
);

const APPOINTMENT_ID = "44444444-4444-4444-4444-444444444444";
const BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
const REFERENCE = "PAY-ABC12345";

function fakeProvider(overrides: Partial<ReturnType<typeof baseProvider>> = {}) {
  return { ...baseProvider(), ...overrides };
}

function baseProvider() {
  return {
    name: "wompi",
    createPayment: vi.fn().mockResolvedValue({ paymentUrl: "https://checkout.wompi.co/p/xyz", provider: "wompi" }),
    validateWebhook: vi.fn().mockReturnValue(true),
    parseWebhook: vi.fn(),
  };
}

describe("createPayment", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si la Gift Card no existe", async () => {
    vi.mocked(giftCardRepository.findById).mockResolvedValue(null);

    await expect(createPayment({ entityType: "GIFT_CARD", entityId: "gift-1" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("lanza ValidationError si la Gift Card ya no está PENDING", async () => {
    vi.mocked(giftCardRepository.findById).mockResolvedValue({ id: "gift-1", status: "PAID" } as never);

    await expect(createPayment({ entityType: "GIFT_CARD", entityId: "gift-1" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("crea el payment de una Gift Card y guarda la referencia", async () => {
    vi.mocked(giftCardRepository.findById).mockResolvedValue({
      id: "gift-1",
      businessId: BUSINESS_ID,
      status: "PENDING",
      paymentReference: null,
      amount: 90000,
    } as never);
    vi.mocked(businessRepository.findById).mockResolvedValue({ id: BUSINESS_ID, currency: "COP" } as never);
    const provider = fakeProvider();
    vi.mocked(getPaymentProvider).mockReturnValue(provider as never);

    const result = await createPayment({ entityType: "GIFT_CARD", entityId: "gift-1" });

    const [data] = vi.mocked(paymentRepository.create).mock.calls[0]!;
    expect(data.entityType).toBe("GIFT_CARD");
    expect(data.entityId).toBe("gift-1");
    expect(giftCardRepository.setPaymentReference).toHaveBeenCalledWith(
      "gift-1",
      expect.stringMatching(/^PAY-/),
      expect.anything(),
    );
    expect(result.paymentUrl).toBe("https://checkout.wompi.co/p/xyz");
  });

  it("lanza NotFoundError si la reserva no existe", async () => {
    vi.mocked(appointmentRepository.findById).mockResolvedValue(null);

    await expect(createPayment({ entityType: "APPOINTMENT", entityId: APPOINTMENT_ID })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("lanza ValidationError si la reserva ya no está PENDING", async () => {
    vi.mocked(appointmentRepository.findById).mockResolvedValue({
      id: APPOINTMENT_ID,
      status: "CONFIRMED",
      expiresAt: null,
      paymentReference: null,
    } as never);

    await expect(createPayment({ entityType: "APPOINTMENT", entityId: APPOINTMENT_ID })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("lanza ValidationError si la reserva ya expiró", async () => {
    vi.mocked(appointmentRepository.findById).mockResolvedValue({
      id: APPOINTMENT_ID,
      status: "PENDING",
      expiresAt: new Date(Date.now() - 60_000),
      paymentReference: null,
    } as never);

    await expect(createPayment({ entityType: "APPOINTMENT", entityId: APPOINTMENT_ID })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("crea un payment nuevo y guarda la referencia en la reserva", async () => {
    vi.mocked(appointmentRepository.findById).mockResolvedValue({
      id: APPOINTMENT_ID,
      businessId: BUSINESS_ID,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10 * 60_000),
      paymentReference: null,
      price: 90000,
    } as never);
    vi.mocked(businessRepository.findById).mockResolvedValue({ id: BUSINESS_ID, currency: "COP" } as never);
    const provider = fakeProvider();
    vi.mocked(getPaymentProvider).mockReturnValue(provider as never);

    const result = await createPayment({ entityType: "APPOINTMENT", entityId: APPOINTMENT_ID });

    expect(provider.createPayment).toHaveBeenCalledTimes(1);
    expect(paymentRepository.create).toHaveBeenCalledTimes(1);
    const [data] = vi.mocked(paymentRepository.create).mock.calls[0]!;
    expect(data.status).toBe("PENDING");
    expect(data.entityType).toBe("APPOINTMENT");
    expect(data.entityId).toBe(APPOINTMENT_ID);
    expect(appointmentRepository.setPaymentReference).toHaveBeenCalledWith(
      APPOINTMENT_ID,
      expect.stringMatching(/^PAY-/),
      expect.anything(),
    );
    expect(result.paymentUrl).toBe("https://checkout.wompi.co/p/xyz");
  });

  it("reutiliza la referencia existente si ya hay un payment PENDING, sin crear uno nuevo", async () => {
    vi.mocked(appointmentRepository.findById).mockResolvedValue({
      id: APPOINTMENT_ID,
      businessId: BUSINESS_ID,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10 * 60_000),
      paymentReference: REFERENCE,
      price: 90000,
    } as never);
    vi.mocked(paymentRepository.findByReference).mockResolvedValue({
      reference: REFERENCE,
      status: "PENDING",
      amount: 90000,
      currency: "COP",
    } as never);
    const provider = fakeProvider();
    vi.mocked(getPaymentProvider).mockReturnValue(provider as never);

    const result = await createPayment({ entityType: "APPOINTMENT", entityId: APPOINTMENT_ID });

    expect(result.reference).toBe(REFERENCE);
    expect(paymentRepository.create).not.toHaveBeenCalled();
    expect(businessRepository.findById).not.toHaveBeenCalled();
  });
});

describe("processPaymentWebhook", () => {
  beforeEach(() => {
    vi.mocked(appointmentRepository.findById).mockResolvedValue({
      id: APPOINTMENT_ID,
      businessId: BUSINESS_ID,
      serviceId: "22222222-2222-2222-2222-222222222222",
      appointmentDate: new Date("2026-01-05T00:00:00.000Z"),
      status: "PENDING",
      notes: null,
    } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lanza WebhookVerificationError si la firma es inválida y no procesa el evento", async () => {
    const provider = fakeProvider({ validateWebhook: vi.fn().mockReturnValue(false) } as never);
    vi.mocked(getPaymentProvider).mockReturnValue(provider as never);

    await expect(processPaymentWebhook({ any: "payload" })).rejects.toBeInstanceOf(WebhookVerificationError);
    expect(provider.parseWebhook).not.toHaveBeenCalled();
  });

  it("ignora silenciosamente una referencia desconocida", async () => {
    const provider = fakeProvider();
    provider.parseWebhook.mockReturnValue({
      provider: "wompi",
      reference: "PAY-DOESNOTEXIST",
      transactionId: "tx-1",
      status: "APPROVED",
      amountInCents: 9000000,
      currency: "COP",
      raw: {},
    });
    vi.mocked(getPaymentProvider).mockReturnValue(provider as never);
    vi.mocked(paymentRepository.findByReference).mockResolvedValue(null);

    await expect(processPaymentWebhook({})).resolves.toBeUndefined();
    expect(paymentRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("es idempotente ante un webhook duplicado (payment ya PAID)", async () => {
    const provider = fakeProvider();
    provider.parseWebhook.mockReturnValue({
      provider: "wompi",
      reference: REFERENCE,
      transactionId: "tx-1",
      status: "APPROVED",
      amountInCents: 9000000,
      currency: "COP",
      raw: {},
    });
    vi.mocked(getPaymentProvider).mockReturnValue(provider as never);
    vi.mocked(paymentRepository.findByReference).mockResolvedValue({
      id: "pay-1",
      reference: REFERENCE,
      status: "PAID",
      amount: 90000,
      currency: "COP",
      entityType: "APPOINTMENT",
      entityId: APPOINTMENT_ID,
    } as never);

    await processPaymentWebhook({});

    expect(paymentRepository.updateStatus).not.toHaveBeenCalled();
    expect(appointmentRepository.confirmIfPending).not.toHaveBeenCalled();
  });

  it("lanza PaymentError si el monto o la moneda no coinciden", async () => {
    const provider = fakeProvider();
    provider.parseWebhook.mockReturnValue({
      provider: "wompi",
      reference: REFERENCE,
      transactionId: "tx-1",
      status: "APPROVED",
      amountInCents: 1,
      currency: "COP",
      raw: {},
    });
    vi.mocked(getPaymentProvider).mockReturnValue(provider as never);
    vi.mocked(paymentRepository.findByReference).mockResolvedValue({
      id: "pay-1",
      reference: REFERENCE,
      status: "PENDING",
      amount: 90000,
      currency: "COP",
      entityType: "APPOINTMENT",
      entityId: APPOINTMENT_ID,
    } as never);

    await expect(processPaymentWebhook({})).rejects.toBeInstanceOf(PaymentError);
    expect(paymentRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("confirma la reserva cuando el pago es APPROVED", async () => {
    const provider = fakeProvider();
    provider.parseWebhook.mockReturnValue({
      provider: "wompi",
      reference: REFERENCE,
      transactionId: "tx-1",
      status: "APPROVED",
      amountInCents: 9000000,
      currency: "COP",
      raw: {},
    });
    vi.mocked(getPaymentProvider).mockReturnValue(provider as never);
    vi.mocked(paymentRepository.findByReference).mockResolvedValue({
      id: "pay-1",
      reference: REFERENCE,
      status: "PENDING",
      amount: 90000,
      currency: "COP",
      entityType: "APPOINTMENT",
      entityId: APPOINTMENT_ID,
    } as never);
    vi.mocked(appointmentRepository.confirmIfPending).mockResolvedValue(true);

    await processPaymentWebhook({});

    expect(paymentRepository.updateStatus).toHaveBeenCalledWith(
      "pay-1",
      "PAID",
      "tx-1",
      expect.anything(),
      expect.anything(),
    );
    expect(appointmentRepository.confirmIfPending).toHaveBeenCalledWith(APPOINTMENT_ID, expect.anything());
    expect(notifyAppointmentConfirmed).toHaveBeenCalledWith(APPOINTMENT_ID);
    expect(syncAppointmentToSheet).toHaveBeenCalledWith(APPOINTMENT_ID);
    expect(finalizeGiftCardAfterPayment).not.toHaveBeenCalled();

    // sección 9/12: serializa contra reprocesos del mismo evento (lock por
    // reference) y contra la capacity al confirmar (lock por business/service/fecha).
    expect(executeRawMock).toHaveBeenCalledTimes(2);
    const [, referenceLockKey] = executeRawMock.mock.calls[0] as [TemplateStringsArray, string];
    expect(referenceLockKey).toBe(REFERENCE);
    const [, capacityLockKey] = executeRawMock.mock.calls[1] as [TemplateStringsArray, string];
    expect(capacityLockKey).toBe(`${BUSINESS_ID}:22222222-2222-2222-2222-222222222222:2026-01-05`);
  });

  it("confirma la Gift Card cuando el pago es APPROVED (en vez de una reserva)", async () => {
    const provider = fakeProvider();
    provider.parseWebhook.mockReturnValue({
      provider: "wompi",
      reference: REFERENCE,
      transactionId: "tx-1",
      status: "APPROVED",
      amountInCents: 9000000,
      currency: "COP",
      raw: {},
    });
    vi.mocked(getPaymentProvider).mockReturnValue(provider as never);
    vi.mocked(paymentRepository.findByReference).mockResolvedValue({
      id: "pay-1",
      reference: REFERENCE,
      status: "PENDING",
      amount: 90000,
      currency: "COP",
      entityType: "GIFT_CARD",
      entityId: "gift-1",
    } as never);
    vi.mocked(confirmGiftCardPayment).mockResolvedValue(true);

    await processPaymentWebhook({});

    expect(confirmGiftCardPayment).toHaveBeenCalledWith("gift-1", expect.anything());
    expect(finalizeGiftCardAfterPayment).toHaveBeenCalledWith("gift-1");
    expect(notifyAppointmentConfirmed).not.toHaveBeenCalled();
    expect(syncAppointmentToSheet).not.toHaveBeenCalled();
  });

  it("marca FAILED sin confirmar la reserva cuando el pago es DECLINED", async () => {
    const provider = fakeProvider();
    provider.parseWebhook.mockReturnValue({
      provider: "wompi",
      reference: REFERENCE,
      transactionId: "tx-1",
      status: "DECLINED",
      amountInCents: 9000000,
      currency: "COP",
      raw: {},
    });
    vi.mocked(getPaymentProvider).mockReturnValue(provider as never);
    vi.mocked(paymentRepository.findByReference).mockResolvedValue({
      id: "pay-1",
      reference: REFERENCE,
      status: "PENDING",
      amount: 90000,
      currency: "COP",
      entityType: "APPOINTMENT",
      entityId: APPOINTMENT_ID,
    } as never);

    await processPaymentWebhook({});

    expect(paymentRepository.updateStatus).toHaveBeenCalledWith(
      "pay-1",
      "FAILED",
      "tx-1",
      expect.anything(),
      expect.anything(),
    );
    expect(appointmentRepository.confirmIfPending).not.toHaveBeenCalled();
    expect(notifyAppointmentConfirmed).not.toHaveBeenCalled();
    expect(syncAppointmentToSheet).not.toHaveBeenCalled();
  });

  it("marca la reserva para revisión manual si el pago llega pero la capacity ya se llenó", async () => {
    const provider = fakeProvider();
    provider.parseWebhook.mockReturnValue({
      provider: "wompi",
      reference: REFERENCE,
      transactionId: "tx-1",
      status: "APPROVED",
      amountInCents: 9000000,
      currency: "COP",
      raw: {},
    });
    vi.mocked(getPaymentProvider).mockReturnValue(provider as never);
    vi.mocked(paymentRepository.findByReference).mockResolvedValue({
      id: "pay-1",
      reference: REFERENCE,
      status: "PENDING",
      amount: 90000,
      currency: "COP",
      entityType: "APPOINTMENT",
      entityId: APPOINTMENT_ID,
    } as never);
    vi.mocked(appointmentRepository.confirmIfPending).mockRejectedValue(
      new Error("appointment_capacity_exceeded"),
    );

    await expect(processPaymentWebhook({})).resolves.toBeUndefined();

    expect(appointmentRepository.markPaymentConflict).toHaveBeenCalledWith(
      APPOINTMENT_ID,
      expect.stringContaining("revisión manual"),
      expect.anything(),
    );
    expect(notifyAppointmentConfirmed).not.toHaveBeenCalled();
    expect(syncAppointmentToSheet).not.toHaveBeenCalled();
  });
});
