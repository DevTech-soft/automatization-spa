import { afterEach, describe, expect, it, vi } from "vitest";

// env.STAFF_PIN se resuelve una sola vez al importar src/config/env.ts — se
// fija aquí, antes de cualquier import real, para probar el canje con PIN
// configurado (ver la nota en gift-card.test.ts).
process.env.STAFF_PIN = "1234";

vi.mock("../../src/repositories/giftCard.repository.js", () => ({
  giftCardRepository: {
    findByCodeGlobal: vi.fn(),
    redeemIfValid: vi.fn(),
  },
}));

const { giftCardRepository } = await import("../../src/repositories/giftCard.repository.js");
const { redeemGiftCard } = await import("../../src/services/gift-card.service.js");
const { GiftCardAlreadyRedeemedError, NotFoundError, UnauthorizedError, ValidationError } = await import(
  "../../src/errors/index.js"
);

const CODE = "GIFT-ABC12345";

function fakeGiftCard(overrides: Record<string, unknown> = {}) {
  return { status: "PAID", expiresAt: null, ...overrides };
}

describe("redeemGiftCard (STAFF_PIN configurado)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lanza UnauthorizedError si el PIN no coincide", async () => {
    await expect(redeemGiftCard(CODE, "0000")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(giftCardRepository.findByCodeGlobal).not.toHaveBeenCalled();
  });

  it("lanza NotFoundError si el código no existe", async () => {
    vi.mocked(giftCardRepository.findByCodeGlobal).mockResolvedValue(null);

    await expect(redeemGiftCard(CODE, "1234")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lanza GiftCardAlreadyRedeemedError si ya fue canjeada", async () => {
    vi.mocked(giftCardRepository.findByCodeGlobal).mockResolvedValue(fakeGiftCard({ status: "REDEEMED" }) as never);

    await expect(redeemGiftCard(CODE, "1234")).rejects.toBeInstanceOf(GiftCardAlreadyRedeemedError);
  });

  it("lanza ValidationError si ya expiró", async () => {
    vi.mocked(giftCardRepository.findByCodeGlobal).mockResolvedValue(
      fakeGiftCard({ expiresAt: new Date(Date.now() - 1000) }) as never,
    );

    await expect(redeemGiftCard(CODE, "1234")).rejects.toBeInstanceOf(ValidationError);
  });

  it("lanza ValidationError si todavía no está pagada", async () => {
    vi.mocked(giftCardRepository.findByCodeGlobal).mockResolvedValue(fakeGiftCard({ status: "PENDING" }) as never);

    await expect(redeemGiftCard(CODE, "1234")).rejects.toBeInstanceOf(ValidationError);
  });

  it("canjea exitosamente una Gift Card PAID/SENT válida", async () => {
    vi.mocked(giftCardRepository.findByCodeGlobal).mockResolvedValue(fakeGiftCard() as never);
    vi.mocked(giftCardRepository.redeemIfValid).mockResolvedValue(true);

    await expect(redeemGiftCard(CODE, "1234")).resolves.toBeUndefined();
    expect(giftCardRepository.redeemIfValid).toHaveBeenCalledWith(CODE);
  });

  it("lanza GiftCardAlreadyRedeemedError si el update atómico pierde la carrera (canje concurrente)", async () => {
    vi.mocked(giftCardRepository.findByCodeGlobal).mockResolvedValue(fakeGiftCard() as never);
    vi.mocked(giftCardRepository.redeemIfValid).mockResolvedValue(false);

    await expect(redeemGiftCard(CODE, "1234")).rejects.toBeInstanceOf(GiftCardAlreadyRedeemedError);
  });
});
