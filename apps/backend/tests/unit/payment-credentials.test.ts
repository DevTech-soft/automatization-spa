import { afterEach, describe, expect, it, vi } from "vitest";

const { upsertMock, findUniqueMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  findUniqueMock: vi.fn(),
}));

vi.mock("../../src/db/prisma.js", () => ({
  prisma: {
    paymentCredentials: { upsert: upsertMock, findUnique: findUniqueMock },
  },
}));

const { paymentCredentialsRepository } = await import(
  "../../src/repositories/paymentCredentials.repository.js"
);
const { isEncryptedSecret } = await import("../../src/utils/crypto.js");

const BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
const RAW = {
  apiKey: "prv_prod_APIKEY",
  publicKey: "pub_prod_PUBKEY",
  integritySecret: "prod_integrity_xyz",
  webhookSecret: "prod_events_abc",
};

describe("paymentCredentialsRepository", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("cifra las 4 llaves al guardar (nunca las escribe en claro)", async () => {
    upsertMock.mockResolvedValue({});

    await paymentCredentialsRepository.upsert(BUSINESS_ID, RAW);

    const arg = upsertMock.mock.calls[0]![0] as {
      create: Record<string, string>;
      update: Record<string, string>;
    };
    for (const field of ["apiKeyEnc", "publicKeyEnc", "integritySecretEnc", "webhookSecretEnc"]) {
      expect(isEncryptedSecret(arg.create[field]!)).toBe(true);
      expect(arg.update[field]).toBe(arg.create[field]);
    }
    // Ninguna de las llaves en claro aparece en el payload.
    const serialized = JSON.stringify(arg);
    for (const value of Object.values(RAW)) {
      expect(serialized).not.toContain(value);
    }
    expect(arg.create.provider).toBe("wompi");
    expect(arg.create.environment).toBe("PROD");
  });

  it("round-trip: findByBusinessId descifra lo que guardó upsert", async () => {
    let stored: Record<string, string> = {};
    upsertMock.mockImplementation((arg: { create: Record<string, string> }) => {
      stored = arg.create;
      return Promise.resolve({});
    });
    await paymentCredentialsRepository.upsert(BUSINESS_ID, { ...RAW, environment: "TEST" });

    findUniqueMock.mockResolvedValue({ ...stored, businessId: BUSINESS_ID });
    const got = await paymentCredentialsRepository.findByBusinessId(BUSINESS_ID);

    expect(got).toEqual({
      provider: "wompi",
      apiKey: RAW.apiKey,
      publicKey: RAW.publicKey,
      integritySecret: RAW.integritySecret,
      webhookSecret: RAW.webhookSecret,
      environment: "TEST",
    });
  });

  it("devuelve null si el negocio no tiene credenciales", async () => {
    findUniqueMock.mockResolvedValue(null);
    expect(await paymentCredentialsRepository.findByBusinessId(BUSINESS_ID)).toBeNull();
  });
});
