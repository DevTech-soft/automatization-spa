import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/business.repository.js", () => ({
  businessRepository: { findByWhatsAppNumber: vi.fn(), findById: vi.fn() },
}));
vi.mock("../../src/repositories/whatsAppAccount.repository.js", () => ({
  whatsAppAccountRepository: { findBusinessByPhoneNumberId: vi.fn() },
}));
vi.mock("../../src/repositories/service.repository.js", () => ({
  serviceRepository: { findActiveByBusinessId: vi.fn(), findActiveById: vi.fn() },
}));
vi.mock("../../src/repositories/businessHour.repository.js", () => ({
  businessHourRepository: { findForDay: vi.fn() },
}));
vi.mock("../../src/repositories/appointment.repository.js", () => ({
  appointmentRepository: { findById: vi.fn() },
}));
vi.mock("../../src/repositories/whatsappConversation.repository.js", () => ({
  whatsappConversationRepository: {
    findActive: vi.fn(),
    createInitial: vi.fn(),
    update: vi.fn(),
    reset: vi.fn(),
  },
}));
vi.mock("../../src/integrations/whatsapp/index.js", () => ({
  getWhatsAppProvider: vi.fn(),
}));
vi.mock("../../src/services/availability.service.js", () => ({
  getAvailability: vi.fn(),
}));
vi.mock("../../src/services/appointment.service.js", () => ({
  createAppointment: vi.fn(),
}));
vi.mock("../../src/services/payment.service.js", () => ({
  createPayment: vi.fn(),
}));

const { businessRepository } = await import("../../src/repositories/business.repository.js");
const { whatsAppAccountRepository } = await import("../../src/repositories/whatsAppAccount.repository.js");
const { serviceRepository } = await import("../../src/repositories/service.repository.js");
const { businessHourRepository } = await import("../../src/repositories/businessHour.repository.js");
const { appointmentRepository } = await import("../../src/repositories/appointment.repository.js");
const { whatsappConversationRepository } = await import(
  "../../src/repositories/whatsappConversation.repository.js"
);
const { getWhatsAppProvider } = await import("../../src/integrations/whatsapp/index.js");
const { getAvailability } = await import("../../src/services/availability.service.js");
const { createAppointment } = await import("../../src/services/appointment.service.js");
const { createPayment } = await import("../../src/services/payment.service.js");
const { handleIncomingWhatsAppMessage } = await import("../../src/services/whatsapp-conversation.service.js");
const { AvailabilityError } = await import("../../src/errors/index.js");

const BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
const SERVICE_ID = "22222222-2222-2222-2222-222222222222";
const CONVERSATION_ID = "33333333-3333-3333-3333-333333333333";
const APPOINTMENT_ID = "44444444-4444-4444-4444-444444444444";
const PHONE = "+573001112233";
const BUSINESS_WA_NUMBER = "573000000000";

function fakeProvider() {
  return {
    name: "meta",
    sendText: vi.fn().mockResolvedValue(undefined),
    sendTemplate: vi.fn().mockResolvedValue(undefined),
    sendInteractiveMessage: vi.fn().mockResolvedValue(undefined),
    sendDocument: vi.fn().mockResolvedValue(undefined),
    parseIncomingMessage: vi.fn(),
    validateWebhookSignature: vi.fn().mockReturnValue(true),
  };
}

function mockBusinessFound() {
  vi.mocked(businessRepository.findByWhatsAppNumber).mockResolvedValue({
    id: BUSINESS_ID,
    name: "Demo Spa",
    phone: null,
    timezone: "America/Bogota",
    whatsappNumber: BUSINESS_WA_NUMBER,
    status: "ACTIVE",
    active: true,
  } as never);
  vi.mocked(businessRepository.findById).mockResolvedValue({
    id: BUSINESS_ID,
    timezone: "America/Bogota",
    status: "ACTIVE",
    active: true,
  } as never);
}

function baseConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION_ID,
    businessId: BUSINESS_ID,
    phone: PHONE,
    state: "SELECTING_SERVICE",
    serviceId: null,
    date: null,
    startTime: null,
    customerName: null,
    appointmentId: null,
    ...overrides,
  };
}

describe("handleIncomingWhatsAppMessage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("ignora eventos que no son mensajes (statuses)", async () => {
    const provider = fakeProvider();
    provider.parseIncomingMessage.mockReturnValue({ kind: "ignored" });
    vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);

    await handleIncomingWhatsAppMessage({});

    expect(businessRepository.findByWhatsAppNumber).not.toHaveBeenCalled();
  });

  it("no hace nada si el número receptor no pertenece a ningún negocio", async () => {
    const provider = fakeProvider();
    provider.parseIncomingMessage.mockReturnValue({ kind: "text", from: PHONE, to: "000", text: "hola" });
    vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
    vi.mocked(businessRepository.findByWhatsAppNumber).mockResolvedValue(null);

    await handleIncomingWhatsAppMessage({});

    expect(whatsappConversationRepository.findActive).not.toHaveBeenCalled();
  });

  it("suspensión suave: un negocio SUSPENDED recibe un único mensaje y no procesa la conversación", async () => {
    const provider = fakeProvider();
    provider.parseIncomingMessage.mockReturnValue({ kind: "text", from: PHONE, to: BUSINESS_WA_NUMBER, text: "hola" });
    vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
    vi.mocked(businessRepository.findByWhatsAppNumber).mockResolvedValue({
      id: BUSINESS_ID,
      name: "Demo Spa",
      phone: "+573009998877",
      timezone: "America/Bogota",
      whatsappNumber: BUSINESS_WA_NUMBER,
      status: "SUSPENDED",
      active: true,
    } as never);

    await handleIncomingWhatsAppMessage({});

    expect(provider.sendText).toHaveBeenCalledTimes(1);
    expect(provider.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining("temporalmente inactivo"));
    expect(whatsappConversationRepository.findActive).not.toHaveBeenCalled();
  });

  it("un negocio CANCELLED no recibe ninguna respuesta (silencio total)", async () => {
    const provider = fakeProvider();
    provider.parseIncomingMessage.mockReturnValue({ kind: "text", from: PHONE, to: BUSINESS_WA_NUMBER, text: "hola" });
    vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
    vi.mocked(businessRepository.findByWhatsAppNumber).mockResolvedValue({
      id: BUSINESS_ID,
      name: "Demo Spa",
      timezone: "America/Bogota",
      whatsappNumber: BUSINESS_WA_NUMBER,
      status: "CANCELLED",
      active: true,
    } as never);

    await handleIncomingWhatsAppMessage({});

    expect(provider.sendText).not.toHaveBeenCalled();
    expect(whatsappConversationRepository.findActive).not.toHaveBeenCalled();
  });

  it("resuelve el tenant por phone_number_id cuando hay una WhatsAppAccount", async () => {
    const provider = fakeProvider();
    provider.parseIncomingMessage.mockReturnValue({
      kind: "text",
      from: PHONE,
      to: "otro-numero",
      phoneNumberId: "pn-123",
      text: "hola",
    });
    vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
    vi.mocked(whatsAppAccountRepository.findBusinessByPhoneNumberId).mockResolvedValue({
      id: BUSINESS_ID,
      name: "Demo Spa",
      timezone: "America/Bogota",
      status: "ACTIVE",
      active: true,
    } as never);
    vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(null);
    vi.mocked(whatsappConversationRepository.createInitial).mockResolvedValue({ id: CONVERSATION_ID } as never);
    vi.mocked(serviceRepository.findActiveByBusinessId).mockResolvedValue([] as never);

    await handleIncomingWhatsAppMessage({});

    expect(whatsAppAccountRepository.findBusinessByPhoneNumberId).toHaveBeenCalledWith("pn-123");
    expect(businessRepository.findByWhatsAppNumber).not.toHaveBeenCalled();
  });

  it("inicia una conversación nueva y envía la lista de servicios", async () => {
    const provider = fakeProvider();
    provider.parseIncomingMessage.mockReturnValue({
      kind: "text",
      from: PHONE,
      to: BUSINESS_WA_NUMBER,
      text: "hola",
    });
    vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
    mockBusinessFound();
    vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(null);
    vi.mocked(whatsappConversationRepository.createInitial).mockResolvedValue(baseConversation() as never);
    vi.mocked(serviceRepository.findActiveByBusinessId).mockResolvedValue([
      { id: SERVICE_ID, name: "Masaje", durationMinutes: 60, price: { toString: () => "90000" } },
    ] as never);

    await handleIncomingWhatsAppMessage({});

    expect(whatsappConversationRepository.createInitial).toHaveBeenCalledWith(BUSINESS_ID, PHONE);
    expect(provider.sendInteractiveMessage).toHaveBeenCalledWith(
      PHONE,
      expect.objectContaining({ type: "list" }),
    );
  });

  it("reinicia una conversación CONFIRMED y vuelve a mostrar servicios", async () => {
    const provider = fakeProvider();
    provider.parseIncomingMessage.mockReturnValue({
      kind: "text",
      from: PHONE,
      to: BUSINESS_WA_NUMBER,
      text: "hola de nuevo",
    });
    vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
    mockBusinessFound();
    vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(
      baseConversation({ state: "CONFIRMED" }) as never,
    );
    vi.mocked(whatsappConversationRepository.reset).mockResolvedValue(baseConversation() as never);
    vi.mocked(serviceRepository.findActiveByBusinessId).mockResolvedValue([] as never);

    await handleIncomingWhatsAppMessage({});

    expect(whatsappConversationRepository.reset).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(provider.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining("no tenemos servicios"));
  });

  it('"cancelar" reinicia la conversación a CANCELLED', async () => {
    const provider = fakeProvider();
    provider.parseIncomingMessage.mockReturnValue({
      kind: "text",
      from: PHONE,
      to: BUSINESS_WA_NUMBER,
      text: "Cancelar",
    });
    vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
    mockBusinessFound();
    vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(
      baseConversation({ state: "SELECTING_TIME" }) as never,
    );

    await handleIncomingWhatsAppMessage({});

    expect(whatsappConversationRepository.reset).toHaveBeenCalledWith(CONVERSATION_ID, "CANCELLED");
    expect(provider.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining("cancelada"));
  });

  describe("estado SELECTING_SERVICE", () => {
    it("avanza a SELECTING_DATE cuando el servicio elegido es válido", async () => {
      const provider = fakeProvider();
      provider.parseIncomingMessage.mockReturnValue({
        kind: "interactive_reply",
        from: PHONE,
        to: BUSINESS_WA_NUMBER,
        replyId: SERVICE_ID,
      });
      vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
      mockBusinessFound();
      vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(baseConversation() as never);
      vi.mocked(serviceRepository.findActiveById).mockResolvedValue({ id: SERVICE_ID, name: "Masaje" } as never);
      vi.mocked(businessHourRepository.findForDay).mockResolvedValue({ openTime: "09:00", closeTime: "18:00" } as never);

      await handleIncomingWhatsAppMessage({});

      expect(whatsappConversationRepository.update).toHaveBeenCalledWith(CONVERSATION_ID, {
        serviceId: SERVICE_ID,
        state: "SELECTING_DATE",
      });
      expect(provider.sendInteractiveMessage).toHaveBeenCalledWith(PHONE, expect.objectContaining({ type: "list" }));
    });

    it("vuelve a mostrar la lista si el servicio no existe", async () => {
      const provider = fakeProvider();
      provider.parseIncomingMessage.mockReturnValue({
        kind: "interactive_reply",
        from: PHONE,
        to: BUSINESS_WA_NUMBER,
        replyId: "unknown",
      });
      vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
      mockBusinessFound();
      vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(baseConversation() as never);
      vi.mocked(serviceRepository.findActiveById).mockResolvedValue(null);
      vi.mocked(serviceRepository.findActiveByBusinessId).mockResolvedValue([] as never);

      await handleIncomingWhatsAppMessage({});

      expect(whatsappConversationRepository.update).not.toHaveBeenCalled();
      expect(provider.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining("ya no está disponible"));
    });
  });

  describe("estado SELECTING_DATE", () => {
    it("avanza a SELECTING_TIME y muestra horarios disponibles", async () => {
      const provider = fakeProvider();
      provider.parseIncomingMessage.mockReturnValue({
        kind: "interactive_reply",
        from: PHONE,
        to: BUSINESS_WA_NUMBER,
        replyId: "2026-01-06",
      });
      vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
      mockBusinessFound();
      vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(
        baseConversation({ state: "SELECTING_DATE", serviceId: SERVICE_ID }) as never,
      );
      vi.mocked(getAvailability).mockResolvedValue({
        businessId: BUSINESS_ID,
        serviceId: SERVICE_ID,
        date: "2026-01-06",
        timezone: "America/Bogota",
        slots: [
          { startTime: "10:00", endTime: "11:00", available: true },
          { startTime: "10:30", endTime: "11:30", available: false },
        ],
      });

      await handleIncomingWhatsAppMessage({});

      expect(whatsappConversationRepository.update).toHaveBeenCalledWith(
        CONVERSATION_ID,
        expect.objectContaining({ state: "SELECTING_TIME" }),
      );
      const call = provider.sendInteractiveMessage.mock.calls.at(-1)!;
      expect(call[1].sections[0].rows).toEqual([{ id: "10:00", title: "10:00" }]);
    });

    it("si no hay disponibilidad ese día, vuelve a pedir fecha (no se queda en SELECTING_TIME)", async () => {
      const provider = fakeProvider();
      provider.parseIncomingMessage.mockReturnValue({
        kind: "interactive_reply",
        from: PHONE,
        to: BUSINESS_WA_NUMBER,
        replyId: "2026-01-06",
      });
      vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
      mockBusinessFound();
      vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(
        baseConversation({ state: "SELECTING_DATE", serviceId: SERVICE_ID }) as never,
      );
      vi.mocked(getAvailability).mockResolvedValue({
        businessId: BUSINESS_ID,
        serviceId: SERVICE_ID,
        date: "2026-01-06",
        timezone: "America/Bogota",
        slots: [],
      });
      vi.mocked(businessHourRepository.findForDay).mockResolvedValue(null);

      await handleIncomingWhatsAppMessage({});

      expect(whatsappConversationRepository.update).toHaveBeenLastCalledWith(CONVERSATION_ID, {
        state: "SELECTING_DATE",
      });
      expect(provider.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining("no tenemos disponibilidad"));
    });
  });

  describe("estado SELECTING_TIME", () => {
    it("avanza a COLLECTING_NAME cuando elige un horario válido", async () => {
      const provider = fakeProvider();
      provider.parseIncomingMessage.mockReturnValue({
        kind: "interactive_reply",
        from: PHONE,
        to: BUSINESS_WA_NUMBER,
        replyId: "10:00",
      });
      vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
      mockBusinessFound();
      vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(
        baseConversation({
          state: "SELECTING_TIME",
          serviceId: SERVICE_ID,
          date: new Date("2026-01-06T00:00:00.000Z"),
        }) as never,
      );

      await handleIncomingWhatsAppMessage({});

      expect(whatsappConversationRepository.update).toHaveBeenCalledWith(CONVERSATION_ID, {
        startTime: "10:00",
        state: "COLLECTING_NAME",
      });
      expect(provider.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining("nombre"));
    });
  });

  describe("estado COLLECTING_NAME", () => {
    it("crea la reserva y el link de pago, y avanza a WAITING_PAYMENT", async () => {
      const provider = fakeProvider();
      provider.parseIncomingMessage.mockReturnValue({
        kind: "text",
        from: PHONE,
        to: BUSINESS_WA_NUMBER,
        text: "María Pérez",
      });
      vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
      mockBusinessFound();
      vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(
        baseConversation({
          state: "COLLECTING_NAME",
          serviceId: SERVICE_ID,
          date: new Date("2026-01-06T00:00:00.000Z"),
          startTime: "10:00",
        }) as never,
      );
      vi.mocked(createAppointment).mockResolvedValue({
        id: APPOINTMENT_ID,
        service: { name: "Masaje" },
      } as never);
      vi.mocked(createPayment).mockResolvedValue({
        paymentUrl: "https://checkout.wompi.co/p/xyz",
        reference: "PAY-1",
        chargeMode: "TOTAL",
        amount: 90000,
        pendingBalance: null,
      });

      await handleIncomingWhatsAppMessage({});

      expect(createAppointment).toHaveBeenCalledWith({
        businessId: BUSINESS_ID,
        serviceId: SERVICE_ID,
        date: "2026-01-06",
        startTime: "10:00",
        customerName: "María Pérez",
        customerPhone: PHONE,
        source: "WHATSAPP",
      });
      expect(createPayment).toHaveBeenCalledWith({ entityType: "APPOINTMENT", entityId: APPOINTMENT_ID });
      expect(whatsappConversationRepository.update).toHaveBeenCalledWith(CONVERSATION_ID, {
        state: "WAITING_PAYMENT",
        appointmentId: APPOINTMENT_ID,
      });
      expect(provider.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining("checkout.wompi.co"));
    });

    it("en modo abono, el mensaje pide el abono y menciona el saldo en el local", async () => {
      const provider = fakeProvider();
      provider.parseIncomingMessage.mockReturnValue({
        kind: "text",
        from: PHONE,
        to: BUSINESS_WA_NUMBER,
        text: "María Pérez",
      });
      vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
      mockBusinessFound();
      vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(
        baseConversation({
          state: "COLLECTING_NAME",
          serviceId: SERVICE_ID,
          date: new Date("2026-01-06T00:00:00.000Z"),
          startTime: "10:00",
        }) as never,
      );
      vi.mocked(createAppointment).mockResolvedValue({ id: APPOINTMENT_ID, service: { name: "Masaje" } } as never);
      vi.mocked(createPayment).mockResolvedValue({
        paymentUrl: "https://checkout.wompi.co/p/xyz",
        reference: "PAY-1",
        chargeMode: "DEPOSIT",
        amount: 27000,
        pendingBalance: 63000,
      });

      await handleIncomingWhatsAppMessage({});

      const [, body] = vi.mocked(provider.sendText).mock.calls[0]!;
      expect(body).toMatch(/abona/i);
      expect(body).toContain("checkout.wompi.co");
      expect(body).toMatch(/saldo/i);
    });

    it("si el horario ya no está disponible al crear la reserva, vuelve a SELECTING_TIME", async () => {
      const provider = fakeProvider();
      provider.parseIncomingMessage.mockReturnValue({
        kind: "text",
        from: PHONE,
        to: BUSINESS_WA_NUMBER,
        text: "María Pérez",
      });
      vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
      mockBusinessFound();
      vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(
        baseConversation({
          state: "COLLECTING_NAME",
          serviceId: SERVICE_ID,
          date: new Date("2026-01-06T00:00:00.000Z"),
          startTime: "10:00",
        }) as never,
      );
      vi.mocked(createAppointment).mockRejectedValue(new AvailabilityError("Lo sentimos, no hay disponibilidad."));
      vi.mocked(getAvailability).mockResolvedValue({
        businessId: BUSINESS_ID,
        serviceId: SERVICE_ID,
        date: "2026-01-06",
        timezone: "America/Bogota",
        slots: [{ startTime: "11:00", endTime: "12:00", available: true }],
      });

      await handleIncomingWhatsAppMessage({});

      expect(createPayment).not.toHaveBeenCalled();
      expect(whatsappConversationRepository.update).toHaveBeenCalledWith(CONVERSATION_ID, { state: "SELECTING_TIME" });
      expect(provider.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining("Elige otro horario"));
    });
  });

  describe("estado WAITING_PAYMENT", () => {
    it('responde el estado actual cuando el cliente escribe "estado"', async () => {
      const provider = fakeProvider();
      provider.parseIncomingMessage.mockReturnValue({
        kind: "text",
        from: PHONE,
        to: BUSINESS_WA_NUMBER,
        text: "estado",
      });
      vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
      mockBusinessFound();
      vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(
        baseConversation({ state: "WAITING_PAYMENT", appointmentId: APPOINTMENT_ID }) as never,
      );
      vi.mocked(appointmentRepository.findById).mockResolvedValue({
        id: APPOINTMENT_ID,
        appointmentCode: "APT-ABC12345",
        status: "PENDING",
        paymentStatus: "PENDING",
      } as never);

      await handleIncomingWhatsAppMessage({});

      expect(provider.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining("APT-ABC12345"));
      expect(createPayment).not.toHaveBeenCalled();
    });

    it("informa que ya está confirmada si el webhook de pago ya la confirmó", async () => {
      const provider = fakeProvider();
      provider.parseIncomingMessage.mockReturnValue({
        kind: "text",
        from: PHONE,
        to: BUSINESS_WA_NUMBER,
        text: "hola",
      });
      vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
      mockBusinessFound();
      vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(
        baseConversation({ state: "WAITING_PAYMENT", appointmentId: APPOINTMENT_ID }) as never,
      );
      vi.mocked(appointmentRepository.findById).mockResolvedValue({
        id: APPOINTMENT_ID,
        status: "CONFIRMED",
        paymentStatus: "PAID",
      } as never);

      await handleIncomingWhatsAppMessage({});

      expect(whatsappConversationRepository.update).toHaveBeenCalledWith(CONVERSATION_ID, { state: "CONFIRMED" });
      expect(provider.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining("confirmada"));
    });

    it("reenvía el link de pago ante cualquier otro mensaje", async () => {
      const provider = fakeProvider();
      provider.parseIncomingMessage.mockReturnValue({
        kind: "text",
        from: PHONE,
        to: BUSINESS_WA_NUMBER,
        text: "ya pagué",
      });
      vi.mocked(getWhatsAppProvider).mockReturnValue(provider as never);
      mockBusinessFound();
      vi.mocked(whatsappConversationRepository.findActive).mockResolvedValue(
        baseConversation({ state: "WAITING_PAYMENT", appointmentId: APPOINTMENT_ID }) as never,
      );
      vi.mocked(appointmentRepository.findById).mockResolvedValue({
        id: APPOINTMENT_ID,
        status: "PENDING",
        paymentStatus: "PENDING",
      } as never);
      vi.mocked(createPayment).mockResolvedValue({
        paymentUrl: "https://checkout.wompi.co/p/xyz",
        reference: "PAY-1",
        chargeMode: "TOTAL",
        amount: 90000,
        pendingBalance: null,
      });

      await handleIncomingWhatsAppMessage({});

      expect(createPayment).toHaveBeenCalledWith({ entityType: "APPOINTMENT", entityId: APPOINTMENT_ID });
      expect(provider.sendText).toHaveBeenCalledWith(PHONE, expect.stringContaining("checkout.wompi.co"));
    });
  });
});
