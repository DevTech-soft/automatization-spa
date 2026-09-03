import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/adminBusiness.repository.js", () => ({
  adminBusinessRepository: {
    list: vi.fn(),
    findDetail: vi.fn(),
    findBySlug: vi.fn(),
    createWithOrganization: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("../../src/repositories/auditLog.repository.js", () => ({
  auditLogRepository: { record: vi.fn().mockResolvedValue(undefined) },
}));

const { adminBusinessRepository } = await import("../../src/repositories/adminBusiness.repository.js");
const { auditLogRepository } = await import("../../src/repositories/auditLog.repository.js");
const { createBusiness, updateBusiness, getBusiness } = await import(
  "../../src/services/admin-business.service.js"
);
const { NotFoundError, ValidationError } = await import("../../src/errors/index.js");

const ID = "11111111-1111-1111-1111-111111111111";

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    name: "Demo",
    slug: "demo",
    status: "TRIAL",
    chargeMode: "TOTAL",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    phone: null,
    whatsappNumber: null,
    email: null,
    address: null,
    timezone: "America/Bogota",
    currency: "COP",
    logoUrl: null,
    colorPrimary: null,
    colorSecondary: null,
    depositPercentage: null,
    organization: { id: "org-1" },
    ...overrides,
  } as never;
}

describe("admin-business.service", () => {
  afterEach(() => vi.clearAllMocks());

  it("createBusiness rechaza slug duplicado", async () => {
    vi.mocked(adminBusinessRepository.findBySlug).mockResolvedValue({ id: "other" } as never);
    await expect(createBusiness({ name: "X", slug: "demo" } as never, "op-1")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(adminBusinessRepository.createWithOrganization).not.toHaveBeenCalled();
  });

  it("createBusiness nace en TRIAL, crea la org y registra auditoría", async () => {
    vi.mocked(adminBusinessRepository.findBySlug).mockResolvedValue(null);
    vi.mocked(adminBusinessRepository.createWithOrganization).mockResolvedValue(detailRow());

    const result = await createBusiness(
      { name: "Demo", slug: "demo", timezone: "America/Bogota", currency: "COP" } as never,
      "op-1",
    );

    const [data] = vi.mocked(adminBusinessRepository.createWithOrganization).mock.calls[0]!;
    expect(data.status).toBe("TRIAL");
    expect(result.organizationId).toBe("org-1");
    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "business.create", actor: "op-1", businessId: ID }),
    );
  });

  it("updateBusiness lanza NotFound si no existe", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(null);
    await expect(updateBusiness(ID, { name: "Y" }, "op-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updateBusiness a DEPOSIT sin porcentaje → ValidationError", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(detailRow());
    await expect(updateBusiness(ID, { chargeMode: "DEPOSIT" }, "op-1")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("updateBusiness a TOTAL limpia depositPercentage y audita before/after", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(
      detailRow({ chargeMode: "DEPOSIT", depositPercentage: 30 }),
    );
    vi.mocked(adminBusinessRepository.update).mockResolvedValue(detailRow());

    await updateBusiness(ID, { chargeMode: "TOTAL" }, "op-1");

    const [, data] = vi.mocked(adminBusinessRepository.update).mock.calls[0]!;
    expect(data.depositPercentage).toBeNull();
    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "business.update", before: expect.anything(), after: expect.anything() }),
    );
  });

  it("getBusiness mapea el detalle", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(detailRow({ phone: "+57300" }));
    const d = await getBusiness(ID);
    expect(d).toMatchObject({ id: ID, slug: "demo", phone: "+57300", organizationId: "org-1" });
    expect(typeof d.createdAt).toBe("string");
  });
});
