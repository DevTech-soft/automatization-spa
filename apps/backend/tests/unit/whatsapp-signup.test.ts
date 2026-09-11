import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// El módulo de la Graph API se mockea entero: lo que se prueba aquí es el
// **orden** y las consecuencias de cada paso (§7.4), no la forma de las
// llamadas HTTP a Meta.
vi.mock("../../src/integrations/whatsapp/embedded-signup.js", () => ({
  isEmbeddedSignupConfigured: vi.fn(() => true),
  getEmbeddedSignupPublicConfig: vi.fn(() => ({
    appId: "app-123",
    configId: "config-456",
    graphVersion: "v21.0",
  })),
  exchangeCodeForBusinessToken: vi.fn(),
  subscribeAppToWaba: vi.fn(),
  registerPhoneNumber: vi.fn(),
  fetchPhoneNumberDetails: vi.fn(),
  fetchSubscriptionStatus: vi.fn(),
  generateRegistrationPin: vi.fn(() => "123456"),
}));
vi.mock("../../src/repositories/whatsAppSignupSession.repository.js", () => ({
  generateSignupToken: vi.fn(() => "token-en-claro"),
  // Deliberadamente no contiene el token: así el test puede afirmar que el
  // valor en claro no llega a la base.
  hashSignupToken: vi.fn(() => "sha256-del-token"),
  whatsAppSignupSessionRepository: {
    create: vi.fn(),
    listByBusiness: vi.fn(),
    find: vi.fn(),
    findByToken: vi.fn(),
    update: vi.fn(),
    revokePending: vi.fn().mockResolvedValue({ count: 0 }),
  },
}));
vi.mock("../../src/repositories/whatsAppAccount.repository.js", () => ({
  whatsAppAccountRepository: { findByPhoneNumberId: vi.fn(), connect: vi.fn() },
}));
vi.mock("../../src/repositories/adminBusiness.repository.js", () => ({
  adminBusinessRepository: { findDetail: vi.fn() },
}));
vi.mock("../../src/repositories/auditLog.repository.js", () => ({
  auditLogRepository: { record: vi.fn().mockResolvedValue(undefined) },
}));

const signup = await import("../../src/integrations/whatsapp/embedded-signup.js");
const { whatsAppSignupSessionRepository } = await import(
  "../../src/repositories/whatsAppSignupSession.repository.js"
);
const { whatsAppAccountRepository } = await import(
  "../../src/repositories/whatsAppAccount.repository.js"
);
const { adminBusinessRepository } = await import("../../src/repositories/adminBusiness.repository.js");
const { auditLogRepository } = await import("../../src/repositories/auditLog.repository.js");
const {
  completeEmbeddedSignup,
  completeSignupFromInvite,
  createSignupLink,
  getSignupInvite,
} = await import("../../src/services/whatsapp-signup.service.js");
const { NotFoundError, ValidationError } = await import("../../src/errors/index.js");

const BID = "11111111-1111-1111-1111-111111111111";
const OTHER_BID = "22222222-2222-2222-2222-222222222222";
const SID = "33333333-3333-3333-3333-333333333333";

const CALLBACK = {
  code: "AQD".padEnd(40, "x"),
  wabaId: "102290129340398",
  phoneNumberId: "106540352242922",
  businessPortfolioId: "",
};

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SID,
    businessId: BID,
    tokenHash: "sha256-del-token",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 3_600_000),
    createdBy: "op-1",
    completedAt: null,
    accountId: null,
    wabaId: null,
    phoneNumberId: null,
    lastError: null,
    createdAt: new Date("2026-09-08T00:00:00Z"),
    updatedAt: new Date("2026-09-08T00:00:00Z"),
    business: { id: BID, name: "Spa Demo" },
    ...overrides,
  } as never;
}

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "44444444-4444-4444-4444-444444444444",
    businessId: BID,
    wabaId: CALLBACK.wabaId,
    phoneNumberId: CALLBACK.phoneNumberId,
    displayPhoneNumber: "+57 300 123 4567",
    displayName: "Spa Demo",
    accessTokenEnc: "v1:cifrado",
    subscriptionStatus: "SUBSCRIBED",
    qualityRating: "GREEN",
    messagingLimit: "TIER_1K",
    onboardingSource: "EMBEDDED_SIGNUP",
    businessPortfolioId: null,
    registrationPinEnc: "v1:pin",
    registeredAt: new Date("2026-09-08T00:00:00Z"),
    active: true,
    createdAt: new Date("2026-09-08T00:00:00Z"),
    updatedAt: new Date("2026-09-08T00:00:00Z"),
    ...overrides,
  } as never;
}

function happyPath() {
  vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({ id: BID, name: "Spa Demo" } as never);
  vi.mocked(whatsAppAccountRepository.findByPhoneNumberId).mockResolvedValue(null);
  vi.mocked(signup.exchangeCodeForBusinessToken).mockResolvedValue("EAAG-token-del-cliente");
  vi.mocked(signup.subscribeAppToWaba).mockResolvedValue(undefined);
  vi.mocked(signup.registerPhoneNumber).mockResolvedValue({
    registered: true,
    detail: "Número registrado en Cloud API.",
  });
  vi.mocked(signup.fetchPhoneNumberDetails).mockResolvedValue({
    displayPhoneNumber: "+57 300 123 4567",
    verifiedName: "Spa Demo",
    qualityRating: "GREEN",
    messagingLimit: "TIER_1K",
    codeVerificationStatus: "VERIFIED",
    platformType: "CLOUD_API",
  });
  vi.mocked(signup.fetchSubscriptionStatus).mockResolvedValue("SUBSCRIBED");
  vi.mocked(whatsAppAccountRepository.connect).mockResolvedValue(accountRow());
}

describe("whatsapp-signup.service · completeEmbeddedSignup", () => {
  beforeEach(() => happyPath());
  afterEach(() => vi.clearAllMocks());

  it("canjea, suscribe y registra antes de guardar la cuenta", async () => {
    const result = await completeEmbeddedSignup(BID, CALLBACK, "op-1");

    const exchanged = vi.mocked(signup.exchangeCodeForBusinessToken).mock.invocationCallOrder[0]!;
    const subscribed = vi.mocked(signup.subscribeAppToWaba).mock.invocationCallOrder[0]!;
    const registered = vi.mocked(signup.registerPhoneNumber).mock.invocationCallOrder[0]!;
    const saved = vi.mocked(whatsAppAccountRepository.connect).mock.invocationCallOrder[0]!;
    expect(exchanged).toBeLessThan(subscribed);
    expect(subscribed).toBeLessThan(registered);
    expect(registered).toBeLessThan(saved);

    expect(result.account.onboardingSource).toBe("EMBEDDED_SIGNUP");
    expect(result.account.registered).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it("guarda el token del cliente y el PIN, y nunca devuelve ninguno de los dos", async () => {
    const result = await completeEmbeddedSignup(BID, CALLBACK, "op-1");

    expect(whatsAppAccountRepository.connect).toHaveBeenCalledWith(
      BID,
      expect.objectContaining({
        accessToken: "EAAG-token-del-cliente",
        registrationPin: "123456",
        onboardingSource: "EMBEDDED_SIGNUP",
      }),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("EAAG-token-del-cliente");
    expect(serialized).not.toContain("123456");
  });

  it("si falla la suscripción a la WABA no escribe la cuenta (quedaría muda)", async () => {
    vi.mocked(signup.subscribeAppToWaba).mockRejectedValue(new Error("Meta dijo que no"));

    await expect(completeEmbeddedSignup(BID, CALLBACK, "op-1")).rejects.toThrow("Meta dijo que no");
    expect(signup.registerPhoneNumber).not.toHaveBeenCalled();
    expect(whatsAppAccountRepository.connect).not.toHaveBeenCalled();
  });

  it("rechaza un número que ya es de otro negocio antes de hablar con Meta", async () => {
    vi.mocked(whatsAppAccountRepository.findByPhoneNumberId).mockResolvedValue(
      accountRow({ businessId: OTHER_BID }),
    );

    await expect(completeEmbeddedSignup(BID, CALLBACK, "op-1")).rejects.toBeInstanceOf(ValidationError);
    expect(signup.exchangeCodeForBusinessToken).not.toHaveBeenCalled();
  });

  it("audita el alta", async () => {
    await completeEmbeddedSignup(BID, CALLBACK, "op-1");

    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "whatsapp.account.embedded_signup", businessId: BID }),
    );
  });
});

describe("whatsapp-signup.service · enlaces de auto-conexión", () => {
  beforeEach(() => {
    happyPath();
    vi.mocked(whatsAppSignupSessionRepository.create).mockResolvedValue(sessionRow());
  });
  afterEach(() => vi.clearAllMocks());

  it("devuelve la URL con el token una sola vez y guarda solo el hash", async () => {
    const session = await createSignupLink(BID, "op-1");

    expect(session.url).toBe("http://localhost:3000/conectar/token-en-claro");
    expect(whatsAppSignupSessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: "sha256-del-token", createdBy: "op-1" }),
    );
    const stored = vi.mocked(whatsAppSignupSessionRepository.create).mock.calls[0]![0];
    expect(JSON.stringify(stored)).not.toContain("token-en-claro");
  });

  it("generar uno nuevo revoca los pendientes", async () => {
    await createSignupLink(BID, "op-1");

    expect(whatsAppSignupSessionRepository.revokePending).toHaveBeenCalledWith(BID);
  });

  it("un token desconocido responde igual que uno inexistente (no es un oráculo)", async () => {
    vi.mocked(whatsAppSignupSessionRepository.findByToken).mockResolvedValue(null);

    await expect(getSignupInvite("cualquiera")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("un enlace vencido se marca EXPIRED al abrirlo y explica por qué", async () => {
    vi.mocked(whatsAppSignupSessionRepository.findByToken).mockResolvedValue(
      sessionRow({ expiresAt: new Date(Date.now() - 1_000) }),
    );

    const invite = await getSignupInvite("token-en-claro");

    expect(invite.status).toBe("EXPIRED");
    expect(invite.unavailableReason).toContain("venció");
    expect(whatsAppSignupSessionRepository.update).toHaveBeenCalledWith(SID, { status: "EXPIRED" });
  });

  it("la portada solo revela el nombre del negocio", async () => {
    vi.mocked(whatsAppSignupSessionRepository.findByToken).mockResolvedValue(sessionRow());

    const invite = await getSignupInvite("token-en-claro");

    expect(invite.businessName).toBe("Spa Demo");
    expect(Object.keys(invite).sort()).toEqual(
      ["businessName", "config", "expiresAt", "status", "unavailableReason"].sort(),
    );
  });

  it("un enlace ya usado no vuelve a conectar nada", async () => {
    vi.mocked(whatsAppSignupSessionRepository.findByToken).mockResolvedValue(
      sessionRow({ status: "COMPLETED" }),
    );

    await expect(completeSignupFromInvite("token-en-claro", CALLBACK)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(signup.exchangeCodeForBusinessToken).not.toHaveBeenCalled();
  });

  it("al completarse marca el enlace COMPLETED con la cuenta creada", async () => {
    vi.mocked(whatsAppSignupSessionRepository.findByToken).mockResolvedValue(sessionRow());

    await completeSignupFromInvite("token-en-claro", CALLBACK);

    expect(whatsAppSignupSessionRepository.update).toHaveBeenCalledWith(
      SID,
      expect.objectContaining({ status: "COMPLETED", phoneNumberId: CALLBACK.phoneNumberId }),
    );
  });

  it("si Meta falla, el enlace sigue sirviendo y guarda el motivo", async () => {
    vi.mocked(whatsAppSignupSessionRepository.findByToken).mockResolvedValue(sessionRow());
    vi.mocked(signup.registerPhoneNumber).mockRejectedValue(
      new Error("El número ya tiene otro PIN de dos pasos."),
    );

    await expect(completeSignupFromInvite("token-en-claro", CALLBACK)).rejects.toThrow();

    expect(whatsAppSignupSessionRepository.update).toHaveBeenCalledWith(SID, {
      lastError: "El número ya tiene otro PIN de dos pasos.",
    });
    expect(whatsAppSignupSessionRepository.update).not.toHaveBeenCalledWith(
      SID,
      expect.objectContaining({ status: "COMPLETED" }),
    );
  });
});
