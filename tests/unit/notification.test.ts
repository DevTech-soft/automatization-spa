import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../../src/repositories/appointment.repository.js", () => ({
  appointmentRepository: { findByIdWithDetails: vi.fn() },
}));
vi.mock("../../src/repositories/notificationLog.repository.js", () => ({
  notificationLogRepository: { create: vi.fn() },
}));
vi.mock("../../src/integrations/whatsapp/index.js", () => ({
  getWhatsAppProvider: vi.fn(),
}));

const { appointmentRepository } = await import("../../src/repositories/appointment.repository.js");
const { notificationLogRepository } = await import("../../src/repositories/notificationLog.repository.js");
const { getWhatsAppProvider } = await import("../../src/integrations/whatsapp/index.js");
const { notifyAppointmentConfirmed } = await import("../../src/services/notification.service.js");

const APPOINTMENT_ID = "44444444-4444-4444-4444-444444444444";

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
