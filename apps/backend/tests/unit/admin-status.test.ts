import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/adminBusiness.repository.js", () => ({
  adminBusinessRepository: { findDetail: vi.fn(), updateStatus: vi.fn() },
}));
vi.mock("../../src/repositories/auditLog.repository.js", () => ({
  auditLogRepository: { record: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../src/services/admin-business.service.js", () => ({ getBusiness: vi.fn() }));

const { adminBusinessRepository } = await import("../../src/repositories/adminBusiness.repository.js");
const { auditLogRepository } = await import("../../src/repositories/auditLog.repository.js");
const { getBusiness } = await import("../../src/services/admin-business.service.js");
const { changeBusinessStatus } = await import("../../src/services/admin-status.service.js");
const { NotFoundError, ValidationError } = await import("../../src/errors/index.js");

const BID = "11111111-1111-1111-1111-111111111111";

function withStatus(status: string) {
  vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({ id: BID, status } as never);
  vi.mocked(getBusiness).mockResolvedValue({ id: BID, status } as never);
}

describe("admin-status.service", () => {
  afterEach(() => vi.clearAllMocks());

  it("suspende un negocio activo y lo deja en la bitácora con motivo", async () => {
    withStatus("ACTIVE");

    await changeBusinessStatus(BID, { status: "SUSPENDED", reason: "no pagó septiembre" }, "op-1");

    expect(adminBusinessRepository.updateStatus).toHaveBeenCalledWith(BID, "SUSPENDED");
    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "business.status.change",
        after: { status: "SUSPENDED", reason: "no pagó septiembre" },
      }),
    );
  });

  it("reactiva un suspendido", async () => {
    withStatus("SUSPENDED");
    await changeBusinessStatus(BID, { status: "ACTIVE", reason: "pagó" }, "op-1");
    expect(adminBusinessRepository.updateStatus).toHaveBeenCalledWith(BID, "ACTIVE");
  });

  it("rechaza una transición no permitida", async () => {
    withStatus("CANCELLED");
    await expect(
      changeBusinessStatus(BID, { status: "SUSPENDED", reason: "x" }, "op-1"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(adminBusinessRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("no deja saltarse el checklist para salir de la prueba", async () => {
    withStatus("TRIAL");
    await expect(
      changeBusinessStatus(BID, { status: "ACTIVE", reason: "ya está listo" }, "op-1"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza cambiar al estado en el que ya está", async () => {
    withStatus("ACTIVE");
    await expect(
      changeBusinessStatus(BID, { status: "ACTIVE", reason: "x" }, "op-1"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("404 si el negocio no existe", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(null);
    await expect(
      changeBusinessStatus(BID, { status: "SUSPENDED", reason: "x" }, "op-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
