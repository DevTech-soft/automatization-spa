import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  appointmentRepository: { findBlocking: vi.fn() },
}));

const { businessRepository } = await import("../../src/repositories/business.repository.js");
const { serviceRepository } = await import("../../src/repositories/service.repository.js");
const { businessHourRepository } = await import("../../src/repositories/businessHour.repository.js");
const { appointmentRepository } = await import("../../src/repositories/appointment.repository.js");
const { getAvailability } = await import("../../src/services/availability.service.js");
const { NotFoundError, ValidationError } = await import("../../src/errors/index.js");

const BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
const SERVICE_ID = "22222222-2222-2222-2222-222222222222";
// Lunes 2026-01-05, 09:00 en America/Bogota (UTC-5) == 14:00 UTC.
const FIXED_NOW = new Date("2026-01-05T14:00:00.000Z");

function mockBusiness() {
  vi.mocked(businessRepository.findById).mockResolvedValue({
    id: BUSINESS_ID,
    timezone: "America/Bogota",
    status: "ACTIVE",
    active: true,
  } as never);
}

function mockService(durationMinutes: number, capacity: number) {
  vi.mocked(serviceRepository.findActiveById).mockResolvedValue({
    id: SERVICE_ID,
    durationMinutes,
    capacity,
  } as never);
}

describe("getAvailability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("genera slots respetando horario y duración, marcando el pasado como no disponible", async () => {
    mockBusiness();
    mockService(60, 1);
    vi.mocked(businessHourRepository.findForDay).mockResolvedValue({
      openTime: "09:00",
      closeTime: "12:00",
    } as never);
    vi.mocked(appointmentRepository.findBlocking).mockResolvedValue([]);

    const result = await getAvailability({ businessId: BUSINESS_ID, serviceId: SERVICE_ID, date: "2026-01-05" });

    expect(result.slots.map((s) => s.startTime)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
    expect(result.slots[0]).toEqual({ startTime: "09:00", endTime: "10:00", available: false }); // es "ahora"
    expect(result.slots[4]).toEqual({ startTime: "11:00", endTime: "12:00", available: true });
  });

  it("marca como no disponible un slot que se solapa con una cita CONFIRMED (capacity=1)", async () => {
    mockBusiness();
    mockService(60, 1);
    vi.mocked(businessHourRepository.findForDay).mockResolvedValue({
      openTime: "09:00",
      closeTime: "12:00",
    } as never);
    vi.mocked(appointmentRepository.findBlocking).mockResolvedValue([
      { startTime: "10:00", endTime: "11:00" },
    ] as never);

    const result = await getAvailability({ businessId: BUSINESS_ID, serviceId: SERVICE_ID, date: "2026-01-05" });

    const bySlot = Object.fromEntries(result.slots.map((s) => [s.startTime, s.available]));
    expect(bySlot["10:00"]).toBe(false);
    expect(bySlot["09:30"]).toBe(false); // se solapa parcialmente
    expect(bySlot["11:00"]).toBe(true); // justo después, no se solapa
  });

  it("permite reservas paralelas hasta la capacity del servicio", async () => {
    mockBusiness();
    mockService(60, 2);
    vi.mocked(businessHourRepository.findForDay).mockResolvedValue({
      openTime: "09:00",
      closeTime: "12:00",
    } as never);
    vi.mocked(appointmentRepository.findBlocking).mockResolvedValue([
      { startTime: "10:00", endTime: "11:00" },
    ] as never);

    const result = await getAvailability({ businessId: BUSINESS_ID, serviceId: SERVICE_ID, date: "2026-01-05" });

    const bySlot = Object.fromEntries(result.slots.map((s) => [s.startTime, s.available]));
    expect(bySlot["10:00"]).toBe(true); // 1 solape < capacity 2
  });

  it("devuelve slots vacíos si el negocio no abre ese día", async () => {
    mockBusiness();
    mockService(60, 1);
    vi.mocked(businessHourRepository.findForDay).mockResolvedValue(null);

    const result = await getAvailability({ businessId: BUSINESS_ID, serviceId: SERVICE_ID, date: "2026-01-05" });

    expect(result.slots).toEqual([]);
  });

  it("rechaza fechas pasadas", async () => {
    mockBusiness();
    mockService(60, 1);

    await expect(
      getAvailability({ businessId: BUSINESS_ID, serviceId: SERVICE_ID, date: "2026-01-01" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("lanza NotFoundError si el negocio no existe", async () => {
    vi.mocked(businessRepository.findById).mockResolvedValue(null);

    await expect(
      getAvailability({ businessId: BUSINESS_ID, serviceId: SERVICE_ID, date: "2026-01-05" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lanza NotFoundError si el servicio no existe o no pertenece al negocio", async () => {
    mockBusiness();
    vi.mocked(serviceRepository.findActiveById).mockResolvedValue(null);

    await expect(
      getAvailability({ businessId: BUSINESS_ID, serviceId: SERVICE_ID, date: "2026-01-05" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
