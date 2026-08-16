import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../../src/repositories/business.repository.js", () => ({
  businessRepository: { findById: vi.fn(), findBySlug: vi.fn() },
}));
vi.mock("../../src/repositories/service.repository.js", () => ({
  serviceRepository: { findActiveById: vi.fn(), findActiveByBusinessId: vi.fn() },
}));
vi.mock("../../src/repositories/businessHour.repository.js", () => ({
  businessHourRepository: { findForDay: vi.fn() },
}));
vi.mock("../../src/repositories/appointment.repository.js", () => ({
  appointmentRepository: {
    findBlocking: vi.fn(),
    create: vi.fn(),
    expireStalePending: vi.fn(),
    findByPaymentReference: vi.fn(),
    findConfirmedForReminders: vi.fn(),
  },
}));
vi.mock("../../src/services/notification.service.js", () => ({
  notifyAppointmentReminder: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/repositories/customer.repository.js", () => ({
  customerRepository: { upsertByPhone: vi.fn() },
}));
vi.mock("../../src/services/google-sheets-sync.service.js", () => ({
  syncAppointmentToSheet: vi.fn().mockResolvedValue(undefined),
  syncCustomerToSheet: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/db/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: { $executeRaw: () => Promise<void> }) => unknown) => {
      const tx = { $executeRaw: vi.fn().mockResolvedValue(undefined) };
      return callback(tx);
    }),
  },
}));

const { businessRepository } = await import("../../src/repositories/business.repository.js");
const { serviceRepository } = await import("../../src/repositories/service.repository.js");
const { businessHourRepository } = await import("../../src/repositories/businessHour.repository.js");
const { appointmentRepository } = await import("../../src/repositories/appointment.repository.js");
const { customerRepository } = await import("../../src/repositories/customer.repository.js");
const { syncAppointmentToSheet, syncCustomerToSheet } = await import(
  "../../src/services/google-sheets-sync.service.js"
);
const { notifyAppointmentReminder } = await import("../../src/services/notification.service.js");
const {
  createAppointment,
  expireStalePendingAppointments,
  getAppointmentStatusByReference,
  sendUpcomingAppointmentReminders,
} = await import("../../src/services/appointment.service.js");
const { AvailabilityError, NotFoundError } = await import("../../src/errors/index.js");

const BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
const SERVICE_ID = "22222222-2222-2222-2222-222222222222";
const CUSTOMER_ID = "33333333-3333-3333-3333-333333333333";
// Lunes 2026-01-05, 09:00 en America/Bogota (UTC-5) == 14:00 UTC.
const FIXED_NOW = new Date("2026-01-05T14:00:00.000Z");

const baseInput = {
  businessId: BUSINESS_ID,
  serviceId: SERVICE_ID,
  date: "2026-01-05",
  startTime: "10:00",
  customerName: "Cliente de Prueba",
  customerPhone: "300 111 2233",
  source: "WEB" as const,
};

function mockHappyPath() {
  vi.mocked(businessRepository.findById).mockResolvedValue({
    id: BUSINESS_ID,
    timezone: "America/Bogota",
  } as never);
  vi.mocked(serviceRepository.findActiveById).mockResolvedValue({
    id: SERVICE_ID,
    durationMinutes: 60,
    capacity: 1,
    price: 90000,
  } as never);
  vi.mocked(businessHourRepository.findForDay).mockResolvedValue({
    openTime: "09:00",
    closeTime: "18:00",
  } as never);
  vi.mocked(appointmentRepository.findBlocking).mockResolvedValue([]);
  vi.mocked(customerRepository.upsertByPhone).mockResolvedValue({
    id: CUSTOMER_ID,
    businessId: BUSINESS_ID,
    phone: "+3001112233",
    name: "Cliente de Prueba",
  } as never);
  vi.mocked(appointmentRepository.create).mockResolvedValue({
    id: "appt-1",
    customerId: CUSTOMER_ID,
    status: "PENDING",
    paymentStatus: "PENDING",
  } as never);
}

describe("createAppointment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("crea una reserva PENDING con expiración a 15 minutos y código APT-", async () => {
    mockHappyPath();

    await createAppointment(baseInput);

    expect(appointmentRepository.create).toHaveBeenCalledTimes(1);
    const [data] = vi.mocked(appointmentRepository.create).mock.calls[0]!;
    expect(data.status).toBe("PENDING");
    expect(data.paymentStatus).toBe("PENDING");
    expect(data.appointmentCode).toMatch(/^APT-[A-Z0-9]{8}$/);
    expect(data.startTime).toBe("10:00");
    expect(data.endTime).toBe("11:00");

    const expiresAt = data.expiresAt as Date;
    expect(expiresAt.getTime() - FIXED_NOW.getTime()).toBe(15 * 60 * 1000);

    expect(syncAppointmentToSheet).toHaveBeenCalledWith("appt-1");
    expect(syncCustomerToSheet).toHaveBeenCalledWith(CUSTOMER_ID);
  });

  it("normaliza el teléfono antes de buscar/crear el cliente (dedup)", async () => {
    mockHappyPath();

    await createAppointment(baseInput);

    expect(customerRepository.upsertByPhone).toHaveBeenCalledWith(
      BUSINESS_ID,
      "3001112233",
      { name: "Cliente de Prueba", email: undefined },
      expect.anything(),
    );
  });

  it("rechaza un horario fuera de business_hours", async () => {
    mockHappyPath();
    vi.mocked(businessHourRepository.findForDay).mockResolvedValue({
      openTime: "09:00",
      closeTime: "10:30",
    } as never);

    await expect(createAppointment(baseInput)).rejects.toBeInstanceOf(AvailabilityError);
    expect(appointmentRepository.create).not.toHaveBeenCalled();
  });

  it("rechaza un horario que se solapa con una cita que ya llena la capacity", async () => {
    mockHappyPath();
    vi.mocked(appointmentRepository.findBlocking).mockResolvedValue([
      { startTime: "10:00", endTime: "11:00" },
    ] as never);

    await expect(createAppointment(baseInput)).rejects.toBeInstanceOf(AvailabilityError);
    expect(appointmentRepository.create).not.toHaveBeenCalled();
  });

  it("reintenta con un nuevo código si hay colisión de unique constraint", async () => {
    mockHappyPath();
    const collision = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "5.20.0",
    });
    vi.mocked(appointmentRepository.create)
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce({ id: "appt-2", status: "PENDING" } as never);

    const result = await createAppointment(baseInput);

    expect(appointmentRepository.create).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ id: "appt-2", status: "PENDING" });
  });
});

describe("expireStalePendingAppointments", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("delega en el repositorio y devuelve la cantidad expirada", async () => {
    vi.mocked(appointmentRepository.expireStalePending).mockResolvedValue(3);

    const count = await expireStalePendingAppointments();

    expect(count).toBe(3);
    expect(appointmentRepository.expireStalePending).toHaveBeenCalledTimes(1);
  });
});

describe("getAppointmentStatusByReference", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si no existe una reserva con esa referencia", async () => {
    vi.mocked(appointmentRepository.findByPaymentReference).mockResolvedValue(null);

    await expect(getAppointmentStatusByReference("PAY-DOESNOTEXIST")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("devuelve el estado resumido de la reserva", async () => {
    vi.mocked(appointmentRepository.findByPaymentReference).mockResolvedValue({
      appointmentCode: "APT-ABC12345",
      status: "CONFIRMED",
      paymentStatus: "PAID",
      appointmentDate: new Date("2026-01-05T00:00:00.000Z"),
      startTime: "10:00",
      endTime: "11:00",
      price: { toString: () => "90000" },
      service: { name: "Masaje relajante" },
    } as never);

    const result = await getAppointmentStatusByReference("PAY-ABC12345");

    expect(result).toEqual({
      appointmentCode: "APT-ABC12345",
      status: "CONFIRMED",
      paymentStatus: "PAID",
      serviceName: "Masaje relajante",
      date: "2026-01-05",
      startTime: "10:00",
      endTime: "11:00",
      price: "90000",
    });
  });
});

describe("sendUpcomingAppointmentReminders", () => {
  // 2026-01-05, 12:00 UTC. Ventana de recordatorio: [2026-01-06T10:30Z, 2026-01-06T12:00Z).
  const REMINDER_NOW = new Date("2026-01-05T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(REMINDER_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("notifica solo las citas cuyo inicio real cae dentro de la ventana de ~24h", async () => {
    vi.mocked(appointmentRepository.findConfirmedForReminders).mockResolvedValue([
      {
        // 06:59 America/Bogota (UTC-5) == 11:59 UTC del 06/01, dentro de la ventana.
        id: "appt-in-window",
        appointmentDate: new Date("2026-01-06T00:00:00.000Z"),
        startTime: "06:59",
        business: { timezone: "America/Bogota" },
      },
      {
        // 20:00 America/Bogota == 01:00 UTC del 07/01, fuera de la ventana.
        id: "appt-out-of-window",
        appointmentDate: new Date("2026-01-06T00:00:00.000Z"),
        startTime: "20:00",
        business: { timezone: "America/Bogota" },
      },
    ] as never);

    const count = await sendUpcomingAppointmentReminders();

    expect(count).toBe(1);
    expect(notifyAppointmentReminder).toHaveBeenCalledTimes(1);
    expect(notifyAppointmentReminder).toHaveBeenCalledWith("appt-in-window");
  });

  it("devuelve 0 sin llamar al servicio de notificación si no hay candidatas", async () => {
    vi.mocked(appointmentRepository.findConfirmedForReminders).mockResolvedValue([]);

    const count = await sendUpcomingAppointmentReminders();

    expect(count).toBe(0);
    expect(notifyAppointmentReminder).not.toHaveBeenCalled();
  });
});
