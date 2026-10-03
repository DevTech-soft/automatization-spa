import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/service.repository.js", () => ({
  serviceRepository: {
    listByBusiness: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../src/repositories/businessHour.repository.js", () => ({
  businessHourRepository: { listByBusiness: vi.fn(), saveWeek: vi.fn() },
}));
vi.mock("../../src/repositories/adminBusiness.repository.js", () => ({
  adminBusinessRepository: { findDetail: vi.fn() },
}));
vi.mock("../../src/repositories/auditLog.repository.js", () => ({
  auditLogRepository: { record: vi.fn().mockResolvedValue(undefined) },
}));

const { serviceRepository } = await import("../../src/repositories/service.repository.js");
const { businessHourRepository } = await import("../../src/repositories/businessHour.repository.js");
const { adminBusinessRepository } = await import("../../src/repositories/adminBusiness.repository.js");
const { auditLogRepository } = await import("../../src/repositories/auditLog.repository.js");
const catalog = await import("../../src/services/admin-catalog.service.js");
const { ConflictError, NotFoundError } = await import("../../src/errors/index.js");

const BID = "11111111-1111-1111-1111-111111111111";
const OTHER = "99999999-9999-9999-9999-999999999999";
const SID = "22222222-2222-2222-2222-222222222222";

function serviceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SID,
    businessId: BID,
    name: "Masaje",
    description: null,
    price: "80000.00",
    durationMinutes: 60,
    capacity: 1,
    active: true,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    _count: { appointments: 0 },
    ...overrides,
  } as never;
}

describe("admin-catalog.service", () => {
  afterEach(() => vi.clearAllMocks());

  it("lista servicios con precio numérico y conteo de citas", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({ id: BID } as never);
    vi.mocked(serviceRepository.listByBusiness).mockResolvedValue([serviceRow({ _count: { appointments: 4 } })]);

    const [service] = await catalog.listCatalogServices(BID);
    expect(service).toMatchObject({ price: 80000, appointmentsCount: 4, description: null });
  });

  it("NotFound si el negocio no existe", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(null);
    await expect(catalog.listCatalogServices(BID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("crea, normaliza la descripción vacía a null y audita", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({ id: BID } as never);
    vi.mocked(serviceRepository.create).mockResolvedValue(serviceRow());

    await catalog.createCatalogService(
      BID,
      { name: "Masaje", description: "", price: 80000, durationMinutes: 60, capacity: 1, active: true },
      "op-1",
    );

    expect(serviceRepository.create).toHaveBeenCalledWith(BID, expect.objectContaining({ description: null }));
    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "business.service.create", businessId: BID }),
    );
  });

  it("no deja editar un servicio de otro negocio", async () => {
    vi.mocked(serviceRepository.find).mockResolvedValue(serviceRow({ businessId: OTHER }));
    await expect(catalog.updateCatalogService(BID, SID, { active: false }, "op-1")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(serviceRepository.update).not.toHaveBeenCalled();
  });

  it("un PATCH parcial solo toca los campos enviados", async () => {
    vi.mocked(serviceRepository.find).mockResolvedValue(serviceRow());
    vi.mocked(serviceRepository.update).mockResolvedValue(serviceRow({ active: false }));

    await catalog.updateCatalogService(BID, SID, { active: false }, "op-1");

    const data = vi.mocked(serviceRepository.update).mock.calls[0]![1];
    expect(data).toMatchObject({ active: false, name: undefined, description: undefined, price: undefined });
  });

  it("no borra un servicio con citas (409) y sí uno sin historial", async () => {
    vi.mocked(serviceRepository.find).mockResolvedValueOnce(serviceRow({ _count: { appointments: 2 } }));
    await expect(catalog.deleteCatalogService(BID, SID, "op-1")).rejects.toBeInstanceOf(ConflictError);
    expect(serviceRepository.delete).not.toHaveBeenCalled();

    vi.mocked(serviceRepository.find).mockResolvedValueOnce(serviceRow());
    await catalog.deleteCatalogService(BID, SID, "op-1");
    expect(serviceRepository.delete).toHaveBeenCalledWith(SID);
  });

  it("devuelve siempre los 7 días; los que no tienen fila salen cerrados", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({ id: BID } as never);
    vi.mocked(businessHourRepository.listByBusiness).mockResolvedValue([
      { id: "h1", businessId: BID, dayOfWeek: 1, openTime: "08:00", closeTime: "17:00", active: true },
    ]);

    const week = await catalog.getBusinessHours(BID);
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual({ dayOfWeek: 0, openTime: "09:00", closeTime: "18:00", active: false });
    expect(week[1]).toEqual({ dayOfWeek: 1, openTime: "08:00", closeTime: "17:00", active: true });
  });

  it("guarda la semana y audita antes/después", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({ id: BID } as never);
    vi.mocked(businessHourRepository.listByBusiness)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "h1", businessId: BID, dayOfWeek: 2, openTime: "10:00", closeTime: "19:00", active: true },
      ]);
    const days = [{ dayOfWeek: 2, openTime: "10:00", closeTime: "19:00", active: true }];

    const week = await catalog.updateBusinessHours(BID, { days }, "op-1");

    expect(businessHourRepository.saveWeek).toHaveBeenCalledWith(BID, days);
    expect(week[2]).toMatchObject({ active: true, openTime: "10:00" });
    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "business.hours.update" }),
    );
  });
});
