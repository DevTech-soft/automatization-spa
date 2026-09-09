import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/whatsAppAccount.repository.js", () => ({
  whatsAppAccountRepository: {
    listByBusiness: vi.fn(),
    find: vi.fn(),
    findByPhoneNumberId: vi.fn(),
    findCredentialsByBusinessId: vi.fn(),
    connect: vi.fn(),
    update: vi.fn(),
    setAccessToken: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../src/repositories/adminBusiness.repository.js", () => ({
  adminBusinessRepository: { findDetail: vi.fn() },
}));
vi.mock("../../src/repositories/auditLog.repository.js", () => ({
  auditLogRepository: { record: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../src/utils/crypto.js", () => ({ maskSecret: vi.fn(() => "••••7890") }));

const { whatsAppAccountRepository } = await import("../../src/repositories/whatsAppAccount.repository.js");
const { adminBusinessRepository } = await import("../../src/repositories/adminBusiness.repository.js");
const { auditLogRepository } = await import("../../src/repositories/auditLog.repository.js");
const { connectWhatsAppAccount, listWhatsAppAccounts, verifyWhatsAppAccount } = await import(
  "../../src/services/admin-whatsapp.service.js"
);
const { NotFoundError, ValidationError } = await import("../../src/errors/index.js");

const BID = "11111111-1111-1111-1111-111111111111";
const OTHER_BID = "22222222-2222-2222-2222-222222222222";
const AID = "33333333-3333-3333-3333-333333333333";

const INPUT = {
  wabaId: "102290129340398",
  phoneNumberId: "106540352242922",
  displayPhoneNumber: "+57 300 123 4567",
  displayName: "Spa Demo",
  accessToken: "EAAG".padEnd(40, "x"),
};

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: AID,
    businessId: BID,
    wabaId: INPUT.wabaId,
    phoneNumberId: INPUT.phoneNumberId,
    displayPhoneNumber: INPUT.displayPhoneNumber,
    displayName: INPUT.displayName,
    accessTokenEnc: "v1:cifrado",
    subscriptionStatus: null,
    qualityRating: null,
    messagingLimit: null,
    active: true,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  } as never;
}

describe("admin-whatsapp.service", () => {
  afterEach(() => vi.clearAllMocks());

  it("nunca devuelve el token, solo su máscara", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({ id: BID } as never);
    vi.mocked(whatsAppAccountRepository.listByBusiness).mockResolvedValue([accountRow()]);

    const accounts = await listWhatsAppAccounts(BID);

    expect(accounts[0]!.accessTokenMask).toBe("••••7890");
    expect(JSON.stringify(accounts)).not.toContain("v1:cifrado");
  });

  it("conecta un número libre", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({ id: BID } as never);
    vi.mocked(whatsAppAccountRepository.findByPhoneNumberId).mockResolvedValue(null);
    vi.mocked(whatsAppAccountRepository.connect).mockResolvedValue(accountRow());

    const account = await connectWhatsAppAccount(BID, INPUT, "op-1");

    expect(account.phoneNumberId).toBe(INPUT.phoneNumberId);
    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "whatsapp.account.connect" }),
    );
  });

  it("no le roba el número a otro negocio", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({ id: BID } as never);
    vi.mocked(whatsAppAccountRepository.findByPhoneNumberId).mockResolvedValue(
      accountRow({ businessId: OTHER_BID }),
    );

    await expect(connectWhatsAppAccount(BID, INPUT, "op-1")).rejects.toBeInstanceOf(ValidationError);
    expect(whatsAppAccountRepository.connect).not.toHaveBeenCalled();
  });

  it("reconectar el mismo número del mismo negocio rota el token", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue({ id: BID } as never);
    vi.mocked(whatsAppAccountRepository.findByPhoneNumberId).mockResolvedValue(accountRow());
    vi.mocked(whatsAppAccountRepository.connect).mockResolvedValue(accountRow());

    await connectWhatsAppAccount(BID, INPUT, "op-1");

    expect(whatsAppAccountRepository.connect).toHaveBeenCalledWith(
      BID,
      expect.objectContaining({ accessToken: INPUT.accessToken }),
    );
  });

  it("rechaza un negocio inexistente", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(null);
    await expect(connectWhatsAppAccount(BID, INPUT, "op-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  describe("verifyWhatsAppAccount", () => {
    it("guarda calidad y límite cuando Meta responde bien", async () => {
      vi.mocked(whatsAppAccountRepository.find).mockResolvedValue(accountRow());
      vi.mocked(whatsAppAccountRepository.findCredentialsByBusinessId).mockResolvedValue({
        accountId: AID,
        businessId: BID,
        wabaId: INPUT.wabaId,
        phoneNumberId: INPUT.phoneNumberId,
        accessToken: "token",
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            display_phone_number: "+57 300 123 4567",
            verified_name: "Spa Demo",
            quality_rating: "GREEN",
            messaging_limit_tier: "TIER_1K",
          }),
        }),
      );

      const health = await verifyWhatsAppAccount(BID, AID);

      expect(health.ok).toBe(true);
      expect(health.qualityRating).toBe("GREEN");
      expect(whatsAppAccountRepository.update).toHaveBeenCalledWith(
        AID,
        expect.objectContaining({ qualityRating: "GREEN", messagingLimit: "TIER_1K" }),
      );
      vi.unstubAllGlobals();
    });

    it("un fallo de Meta se informa, no se lanza", async () => {
      vi.mocked(whatsAppAccountRepository.find).mockResolvedValue(accountRow());
      vi.mocked(whatsAppAccountRepository.findCredentialsByBusinessId).mockResolvedValue({
        accountId: AID,
        businessId: BID,
        wabaId: INPUT.wabaId,
        phoneNumberId: INPUT.phoneNumberId,
        accessToken: "token",
      });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("red caída")));

      const health = await verifyWhatsAppAccount(BID, AID);

      expect(health.ok).toBe(false);
      expect(health.detail).toContain("Graph API");
      vi.unstubAllGlobals();
    });
  });
});
