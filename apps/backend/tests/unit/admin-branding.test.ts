import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/adminBusiness.repository.js", () => ({
  adminBusinessRepository: { findBranding: vi.fn(), updateBranding: vi.fn() },
}));
vi.mock("../../src/repositories/auditLog.repository.js", () => ({
  auditLogRepository: { record: vi.fn().mockResolvedValue(undefined) },
}));

const { adminBusinessRepository } = await import("../../src/repositories/adminBusiness.repository.js");
const { auditLogRepository } = await import("../../src/repositories/auditLog.repository.js");
const { getBranding, updateBranding } = await import("../../src/services/admin-branding.service.js");
const { NotFoundError } = await import("../../src/errors/index.js");

const ID = "11111111-1111-1111-1111-111111111111";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    logoUrl: null,
    colorPrimary: null,
    colorSecondary: null,
    settings: {},
    ...overrides,
  } as never;
}

describe("admin-branding.service", () => {
  afterEach(() => vi.clearAllMocks());

  it("lanza NotFound si el negocio no existe", async () => {
    vi.mocked(adminBusinessRepository.findBranding).mockResolvedValue(null);
    await expect(getBranding(ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lee agentEnabled y agent desde settings", async () => {
    vi.mocked(adminBusinessRepository.findBranding).mockResolvedValue(
      row({ colorPrimary: "#4f46e5", settings: { agentEnabled: true, agent: { ciudad: "Cali" } } }),
    );

    await expect(getBranding(ID)).resolves.toMatchObject({
      businessId: ID,
      colorPrimary: "#4f46e5",
      agentEnabled: true,
      agent: { ciudad: "Cali" },
    });
  });

  it("un campo vaciado ('') borra el color y la clave del agente", async () => {
    vi.mocked(adminBusinessRepository.findBranding).mockResolvedValue(
      row({ colorPrimary: "#4f46e5", settings: { agent: { ciudad: "Cali", tipoNegocio: "Spa" } } }),
    );
    vi.mocked(adminBusinessRepository.updateBranding).mockResolvedValue(row());

    await updateBranding(ID, { colorPrimary: "", agent: { ciudad: "" } }, "op-1");

    const [, data] = vi.mocked(adminBusinessRepository.updateBranding).mock.calls[0]!;
    expect(data.colorPrimary).toBeNull();
    // `logoUrl` no venía en el input: no se toca.
    expect(data.logoUrl).toBeUndefined();
    expect(data.settings).toMatchObject({ agent: { tipoNegocio: "Spa" } });
    expect((data.settings as { agent: Record<string, unknown> }).agent).not.toHaveProperty("ciudad");
  });

  it("no pisa otras claves de settings ni el checklist manual", async () => {
    vi.mocked(adminBusinessRepository.findBranding).mockResolvedValue(
      row({ settings: { googleSheetId: "sheet-1", onboarding: { whatsappProfileApproved: true } } }),
    );
    vi.mocked(adminBusinessRepository.updateBranding).mockResolvedValue(row());

    await updateBranding(ID, { agentEnabled: true, agent: { nombreAgente: "Lucía" } }, "op-1");

    const [, data] = vi.mocked(adminBusinessRepository.updateBranding).mock.calls[0]!;
    expect(data.settings).toMatchObject({
      googleSheetId: "sheet-1",
      onboarding: { whatsappProfileApproved: true },
      agentEnabled: true,
      agent: { nombreAgente: "Lucía" },
    });
    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "business.branding.update", actor: "op-1", businessId: ID }),
    );
  });

  it("un agent que queda vacío se elimina de settings", async () => {
    vi.mocked(adminBusinessRepository.findBranding).mockResolvedValue(
      row({ settings: { agent: { ciudad: "Cali" } } }),
    );
    vi.mocked(adminBusinessRepository.updateBranding).mockResolvedValue(row());

    await updateBranding(ID, { agent: { ciudad: "" } }, "op-1");

    const [, data] = vi.mocked(adminBusinessRepository.updateBranding).mock.calls[0]!;
    expect(data.settings).not.toHaveProperty("agent");
  });
});
