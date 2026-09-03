import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/adminBusiness.repository.js", () => ({
  adminBusinessRepository: {
    findOnboarding: vi.fn(),
    countOnboardingEntities: vi.fn(),
    updateBranding: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("../../src/repositories/auditLog.repository.js", () => ({
  auditLogRepository: { record: vi.fn().mockResolvedValue(undefined) },
}));

const { adminBusinessRepository } = await import("../../src/repositories/adminBusiness.repository.js");
const { auditLogRepository } = await import("../../src/repositories/auditLog.repository.js");
const { activateBusiness, getOnboardingChecklist, updateOnboardingManual } = await import(
  "../../src/services/admin-onboarding.service.js"
);
const { NotFoundError, ValidationError } = await import("../../src/errors/index.js");

const ID = "11111111-1111-1111-1111-111111111111";

const COMPLETE_COUNTS = {
  services: 3,
  businessHours: 6,
  whatsAppAccounts: 1,
  paymentCredentials: 1,
  subscriptionPlans: 1,
};

/** Negocio con todo lo que el checklist deriva de columnas y `settings`. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    name: "Demo",
    status: "TRIAL",
    phone: "+573001112233",
    email: "dueno@demo.co",
    whatsappNumber: null,
    logoUrl: "https://cdn.demo.co/logo.png",
    colorPrimary: "#4f46e5",
    colorSecondary: "#0ea5e9",
    settings: { onboarding: { whatsappProfileApproved: true } },
    ...overrides,
  } as never;
}

function stepByKey(steps: { key: string; done: boolean; required: boolean }[], key: string) {
  return steps.find((s) => s.key === key)!;
}

describe("admin-onboarding.service", () => {
  afterEach(() => vi.clearAllMocks());

  it("lanza NotFound si el negocio no existe", async () => {
    vi.mocked(adminBusinessRepository.findOnboarding).mockResolvedValue(null);
    await expect(getOnboardingChecklist(ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("con todo cargado queda completo y activable", async () => {
    vi.mocked(adminBusinessRepository.findOnboarding).mockResolvedValue(row());
    vi.mocked(adminBusinessRepository.countOnboardingEntities).mockResolvedValue(COMPLETE_COUNTS);

    const checklist = await getOnboardingChecklist(ID);

    expect(checklist.complete).toBe(true);
    expect(checklist.canActivate).toBe(true);
    // El Google Sheet no está configurado y aun así no bloquea (§6.1 paso 7).
    expect(stepByKey(checklist.steps, "googleSheet")).toMatchObject({ done: false, required: false });
  });

  it("sin servicios activos no está completo", async () => {
    vi.mocked(adminBusinessRepository.findOnboarding).mockResolvedValue(row());
    vi.mocked(adminBusinessRepository.countOnboardingEntities).mockResolvedValue({
      ...COMPLETE_COUNTS,
      services: 0,
    });

    const checklist = await getOnboardingChecklist(ID);

    expect(stepByKey(checklist.steps, "services").done).toBe(false);
    expect(checklist.complete).toBe(false);
    expect(checklist.canActivate).toBe(false);
  });

  it("la marca exige la persona del agente solo si el agente está activo", async () => {
    vi.mocked(adminBusinessRepository.countOnboardingEntities).mockResolvedValue(COMPLETE_COUNTS);

    vi.mocked(adminBusinessRepository.findOnboarding).mockResolvedValue(
      row({ settings: { onboarding: { whatsappProfileApproved: true }, agentEnabled: true } }),
    );
    expect(stepByKey((await getOnboardingChecklist(ID)).steps, "branding").done).toBe(false);

    vi.mocked(adminBusinessRepository.findOnboarding).mockResolvedValue(
      row({
        settings: {
          onboarding: { whatsappProfileApproved: true },
          agentEnabled: true,
          agent: { nombreAgente: "Lucía" },
        },
      }),
    );
    expect(stepByKey((await getOnboardingChecklist(ID)).steps, "branding").done).toBe(true);
  });

  it("el perfil de WhatsApp es un paso manual que sale de settings", async () => {
    vi.mocked(adminBusinessRepository.findOnboarding).mockResolvedValue(row({ settings: {} }));
    vi.mocked(adminBusinessRepository.countOnboardingEntities).mockResolvedValue(COMPLETE_COUNTS);

    const step = stepByKey((await getOnboardingChecklist(ID)).steps, "whatsappProfile");
    expect(step).toMatchObject({ done: false, manual: true, required: true });
  });

  it("updateOnboardingManual conserva el resto de settings y audita", async () => {
    vi.mocked(adminBusinessRepository.findOnboarding).mockResolvedValue(
      row({ settings: { agentEnabled: true, agent: { nombreAgente: "Lucía" } } }),
    );
    vi.mocked(adminBusinessRepository.countOnboardingEntities).mockResolvedValue(COMPLETE_COUNTS);
    vi.mocked(adminBusinessRepository.updateBranding).mockResolvedValue({} as never);

    await updateOnboardingManual(ID, { whatsappProfileApproved: true }, "op-1");

    const [, data] = vi.mocked(adminBusinessRepository.updateBranding).mock.calls[0]!;
    expect(data.settings).toMatchObject({
      agentEnabled: true,
      agent: { nombreAgente: "Lucía" },
      onboarding: { whatsappProfileApproved: true },
    });
    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "business.onboarding.update", actor: "op-1" }),
    );
  });

  it("activateBusiness rechaza si faltan pasos requeridos", async () => {
    vi.mocked(adminBusinessRepository.findOnboarding).mockResolvedValue(row());
    vi.mocked(adminBusinessRepository.countOnboardingEntities).mockResolvedValue({
      ...COMPLETE_COUNTS,
      subscriptionPlans: 0,
    });

    await expect(activateBusiness(ID, "op-1")).rejects.toThrow(/Plan de suscripción/);
    expect(adminBusinessRepository.update).not.toHaveBeenCalled();
  });

  it("activateBusiness solo corre desde TRIAL", async () => {
    vi.mocked(adminBusinessRepository.findOnboarding).mockResolvedValue(row({ status: "SUSPENDED" }));
    vi.mocked(adminBusinessRepository.countOnboardingEntities).mockResolvedValue(COMPLETE_COUNTS);

    await expect(activateBusiness(ID, "op-1")).rejects.toBeInstanceOf(ValidationError);
    expect(adminBusinessRepository.update).not.toHaveBeenCalled();
  });

  it("activateBusiness con el checklist completo pasa a ACTIVE y audita", async () => {
    vi.mocked(adminBusinessRepository.findOnboarding)
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ status: "ACTIVE" }));
    vi.mocked(adminBusinessRepository.countOnboardingEntities).mockResolvedValue(COMPLETE_COUNTS);
    vi.mocked(adminBusinessRepository.update).mockResolvedValue({} as never);

    const checklist = await activateBusiness(ID, "op-1");

    expect(adminBusinessRepository.update).toHaveBeenCalledWith(ID, { status: "ACTIVE" });
    expect(checklist.status).toBe("ACTIVE");
    expect(checklist.canActivate).toBe(false);
    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "business.activate", businessId: ID }),
    );
  });
});
