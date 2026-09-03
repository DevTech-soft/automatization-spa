import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@spa/db";

vi.mock("../../src/repositories/appointment.repository.js", () => ({
  appointmentRepository: { findByIdWithDetails: vi.fn() },
}));
vi.mock("../../src/repositories/giftCard.repository.js", () => ({
  giftCardRepository: { findByIdWithDetails: vi.fn(), markSent: vi.fn() },
}));
vi.mock("../../src/repositories/notificationLog.repository.js", () => ({
  notificationLogRepository: { create: vi.fn() },
}));
vi.mock("../../src/integrations/whatsapp/index.js", () => ({
  getWhatsAppProvider: vi.fn(),
}));

const { appointmentRepository } = await import("../../src/repositories/appointment.repository.js");
const { giftCardRepository } = await import("../../src/repositories/giftCard.repository.js");
const { notificationLogRepository } = await import("../../src/repositories/notificationLog.repository.js");
const { getWhatsAppProvider } = await import("../../src/integrations/whatsapp/index.js");
const { notifyAppointmentConfirmed, notifyAppointmentReminder, notifyGiftCardCreated } = await import(
  "../../src/services/notification.service.js"
);

const APPOINTMENT_ID = "44444444-4444-4444-4444-444444444444";
const GIFT_CARD_ID = "55555555-5555-5555-5555-555555555555";

function duplicateError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.20.0",
  });
}

function fakeAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT_ID,
    appointmentCode: "APT-ABC12345",
    appointmentDate: new Date("2026-01-05T00:00:00.000Z"),
    startTime: "10:00",
    endTime: "11:00",
    price: { toString: () => "90000" },
    customer: { name: "Cliente de Prueba", phone: "+573001112233" },
    service: { name: "Masaje relajante" },
    business: { id: "biz-1", name: "Demo Spa", currency: "COP", whatsappNumber: "+573000000000" },
    ...overrides,
  };
}

describe("notifyAppointmentConfirmed", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("no hace nada si la reserva ya no existe", async () => {
    vi.mocked(appointmentRepository.findByIdWithDetails).mockResolvedValue(null);

    await expect(notifyAppointmentConfirmed(APPOINTMENT_ID)).resolves.toBeUndefined();
    expect(notificationLogRepository.create).not.toHaveBeenCalled();
  });

  it("envía WhatsApp al cliente y al negocio cuando ambos se registran por primera vez", async () => {
    vi.mocked(appointmentRepository.findByIdWithDetails).mockResolvedValue(fakeAppointment() as never);
    vi.mocked(notificationLogRepository.create).mockResolvedValue({} as never);
    const sendText = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getWhatsAppProvider).mockReturnValue({ sendText } as never);

    await notifyAppointmentConfirmed(APPOINTMENT_ID);

    expect(sendText).toHaveBeenCalledTimes(2);
    expect(sendText).toHaveBeenCalledWith("+573001112233", expect.stringContaining("Masaje relajante"));
    expect(sendText).toHaveBeenCalledWith("+573000000000", expect.stringContaining("Cliente de Prueba"));
  });

  it("no envía al negocio si no tiene whatsappNumber configurado", async () => {
    vi.mocked(appointmentRepository.findByIdWithDetails).mockResolvedValue(
      fakeAppointment({ business: { id: "biz-1", name: "Demo Spa", currency: "COP", whatsappNumber: null } }) as never,
    );
    vi.mocked(notificationLogRepository.create).mockResolvedValue({} as never);
    const sendText = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getWhatsAppProvider).mockReturnValue({ sendText } as never);

    await notifyAppointmentConfirmed(APPOINTMENT_ID);

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith("+573001112233", expect.anything());
  });

  it("es idempotente: si ya se registró la notificación, no reenvía", async () => {
    vi.mocked(appointmentRepository.findByIdWithDetails).mockResolvedValue(fakeAppointment() as never);
    vi.mocked(notificationLogRepository.create).mockRejectedValue(duplicateError());
    const sendText = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getWhatsAppProvider).mockReturnValue({ sendText } as never);

    await notifyAppointmentConfirmed(APPOINTMENT_ID);

    expect(sendText).not.toHaveBeenCalled();
  });

  it("no propaga el error si falla el envío por WhatsApp", async () => {
    vi.mocked(appointmentRepository.findByIdWithDetails).mockResolvedValue(fakeAppointment() as never);
    vi.mocked(notificationLogRepository.create).mockResolvedValue({} as never);
    const sendText = vi.fn().mockRejectedValue(new Error("network error"));
    vi.mocked(getWhatsAppProvider).mockReturnValue({ sendText } as never);

    await expect(notifyAppointmentConfirmed(APPOINTMENT_ID)).resolves.toBeUndefined();
  });
});

describe("notifyAppointmentReminder", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("no hace nada si la reserva ya no existe", async () => {
    vi.mocked(appointmentRepository.findByIdWithDetails).mockResolvedValue(null);

    await expect(notifyAppointmentReminder(APPOINTMENT_ID)).resolves.toBeUndefined();
    expect(notificationLogRepository.create).not.toHaveBeenCalled();
  });

  it("envía el recordatorio por WhatsApp al cliente", async () => {
    vi.mocked(appointmentRepository.findByIdWithDetails).mockResolvedValue(fakeAppointment() as never);
    vi.mocked(notificationLogRepository.create).mockResolvedValue({} as never);
    const sendText = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getWhatsAppProvider).mockReturnValue({ sendText } as never);

    await notifyAppointmentReminder(APPOINTMENT_ID);

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith("+573001112233", expect.stringContaining("Masaje relajante"));
    expect(notificationLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "APPOINTMENT_REMINDER" }),
    );
  });

  it("es idempotente: si ya se registró el recordatorio, no reenvía", async () => {
    vi.mocked(appointmentRepository.findByIdWithDetails).mockResolvedValue(fakeAppointment() as never);
    vi.mocked(notificationLogRepository.create).mockRejectedValue(duplicateError());
    const sendText = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getWhatsAppProvider).mockReturnValue({ sendText } as never);

    await notifyAppointmentReminder(APPOINTMENT_ID);

    expect(sendText).not.toHaveBeenCalled();
  });

  it("no propaga el error si falla el envío por WhatsApp", async () => {
    vi.mocked(appointmentRepository.findByIdWithDetails).mockResolvedValue(fakeAppointment() as never);
    vi.mocked(notificationLogRepository.create).mockResolvedValue({} as never);
    const sendText = vi.fn().mockRejectedValue(new Error("network error"));
    vi.mocked(getWhatsAppProvider).mockReturnValue({ sendText } as never);

    await expect(notifyAppointmentReminder(APPOINTMENT_ID)).resolves.toBeUndefined();
  });
});

function fakeGiftCard(overrides: Record<string, unknown> = {}) {
  return {
    id: GIFT_CARD_ID,
    code: "GIFT-ABC12345",
    buyerName: "Ana",
    buyerPhone: "+573001112233",
    recipientName: "Luis",
    message: null,
    service: { name: "Masaje relajante" },
    business: { id: "biz-1", name: "Demo Spa", whatsappNumber: "+573000000000" },
    ...overrides,
  };
}

describe("notifyGiftCardCreated", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("no hace nada si la Gift Card no existe", async () => {
    vi.mocked(giftCardRepository.findByIdWithDetails).mockResolvedValue(null);

    await expect(notifyGiftCardCreated(GIFT_CARD_ID, null)).resolves.toBeUndefined();
    expect(notificationLogRepository.create).not.toHaveBeenCalled();
  });

  it("envía el documento al comprador y marca la Gift Card como SENT cuando hay pdfUrl", async () => {
    vi.mocked(giftCardRepository.findByIdWithDetails).mockResolvedValue(fakeGiftCard() as never);
    vi.mocked(notificationLogRepository.create).mockResolvedValue({} as never);
    const sendDocument = vi.fn().mockResolvedValue(undefined);
    const sendText = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getWhatsAppProvider).mockReturnValue({ sendDocument, sendText } as never);

    await notifyGiftCardCreated(GIFT_CARD_ID, "https://storage.example/gift.png");

    expect(sendDocument).toHaveBeenCalledWith(
      "+573001112233",
      "https://storage.example/gift.png",
      expect.stringContaining("Demo Spa"),
    );
    expect(giftCardRepository.markSent).toHaveBeenCalledWith(GIFT_CARD_ID);
    expect(sendText).toHaveBeenCalledWith("+573000000000", expect.stringContaining("Ana"));
  });

  it("envía un texto (sin adjunto) al comprador si no hay pdfUrl", async () => {
    vi.mocked(giftCardRepository.findByIdWithDetails).mockResolvedValue(fakeGiftCard() as never);
    vi.mocked(notificationLogRepository.create).mockResolvedValue({} as never);
    const sendDocument = vi.fn().mockResolvedValue(undefined);
    const sendText = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getWhatsAppProvider).mockReturnValue({ sendDocument, sendText } as never);

    await notifyGiftCardCreated(GIFT_CARD_ID, null);

    expect(sendDocument).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledWith("+573001112233", expect.stringContaining("Demo Spa"));
    expect(giftCardRepository.markSent).toHaveBeenCalledWith(GIFT_CARD_ID);
  });

  it("no envía al negocio si no tiene whatsappNumber configurado", async () => {
    vi.mocked(giftCardRepository.findByIdWithDetails).mockResolvedValue(
      fakeGiftCard({ business: { id: "biz-1", name: "Demo Spa", whatsappNumber: null } }) as never,
    );
    vi.mocked(notificationLogRepository.create).mockResolvedValue({} as never);
    const sendDocument = vi.fn().mockResolvedValue(undefined);
    const sendText = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getWhatsAppProvider).mockReturnValue({ sendDocument, sendText } as never);

    await notifyGiftCardCreated(GIFT_CARD_ID, "https://storage.example/gift.png");

    expect(sendText).not.toHaveBeenCalled();
  });

  it("es idempotente: no reenvía si ya se registró la notificación", async () => {
    vi.mocked(giftCardRepository.findByIdWithDetails).mockResolvedValue(fakeGiftCard() as never);
    vi.mocked(notificationLogRepository.create).mockRejectedValue(duplicateError());
    const sendDocument = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getWhatsAppProvider).mockReturnValue({ sendDocument, sendText: vi.fn() } as never);

    await notifyGiftCardCreated(GIFT_CARD_ID, "https://storage.example/gift.png");

    expect(sendDocument).not.toHaveBeenCalled();
    expect(giftCardRepository.markSent).not.toHaveBeenCalled();
  });
});
