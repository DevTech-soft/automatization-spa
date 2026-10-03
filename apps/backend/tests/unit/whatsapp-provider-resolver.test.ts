import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/integrations/whatsapp/index.js", () => ({
  getWhatsAppProvider: vi.fn(() => ({ name: "env" })),
  getWhatsAppProviderForCredentials: vi.fn(() => ({ name: "tenant" })),
}));
vi.mock("../../src/services/whatsapp-message-log.js", () => ({
  withMessageLog: vi.fn((provider: unknown) => provider),
}));
vi.mock("../../src/repositories/whatsAppAccount.repository.js", () => ({
  whatsAppAccountRepository: { findCredentialsByBusinessId: vi.fn() },
}));

const { getWhatsAppProvider, getWhatsAppProviderForCredentials } = await import(
  "../../src/integrations/whatsapp/index.js"
);
const { whatsAppAccountRepository } = await import("../../src/repositories/whatsAppAccount.repository.js");
const { resolveWhatsAppProviderForBusiness } = await import(
  "../../src/services/whatsapp-provider-resolver.js"
);

const BID = "11111111-1111-1111-1111-111111111111";

describe("resolveWhatsAppProviderForBusiness", () => {
  afterEach(() => vi.clearAllMocks());

  it("usa las credenciales del negocio cuando tiene un número conectado", async () => {
    vi.mocked(whatsAppAccountRepository.findCredentialsByBusinessId).mockResolvedValue({
      accountId: "acc-1",
      businessId: BID,
      wabaId: "123",
      phoneNumberId: "456",
      accessToken: "token-del-cliente",
    });

    const provider = await resolveWhatsAppProviderForBusiness(BID);

    expect(provider).toEqual({ name: "tenant" });
    expect(getWhatsAppProviderForCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumberId: "456", accessToken: "token-del-cliente" }),
    );
    expect(getWhatsAppProvider).not.toHaveBeenCalled();
  });

  it("cae a las credenciales globales del operador mientras no conecte el suyo", async () => {
    vi.mocked(whatsAppAccountRepository.findCredentialsByBusinessId).mockResolvedValue(null);

    const provider = await resolveWhatsAppProviderForBusiness(BID);

    expect(provider).toEqual({ name: "env" });
    expect(getWhatsAppProviderForCredentials).not.toHaveBeenCalled();
  });
});
