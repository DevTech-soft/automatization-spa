import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@spa/db";

vi.mock("../../src/repositories/business.repository.js", () => ({
  businessRepository: { findById: vi.fn() },
}));
vi.mock("../../src/repositories/service.repository.js", () => ({
  serviceRepository: { findActiveById: vi.fn() },
}));
vi.mock("../../src/repositories/giftCard.repository.js", () => ({
  giftCardRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdWithDetails: vi.fn(),
    findByCodeGlobal: vi.fn(),
    findByPaymentReference: vi.fn(),
    setPdfUrl: vi.fn(),
    markSent: vi.fn(),
    redeemIfValid: vi.fn(),
  },
}));
vi.mock("../../src/integrations/storage/index.js", () => ({
  getStorageProvider: vi.fn(),
}));
vi.mock("../../src/services/gift-card-image.service.js", () => ({
  renderGiftCardImage: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
}));
vi.mock("../../src/services/notification.service.js", () => ({
  notifyGiftCardCreated: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/services/google-sheets-sync.service.js", () => ({
  syncGiftCardToSheet: vi.fn().mockResolvedValue(undefined),
}));

const { businessRepository } = await import("../../src/repositories/business.repository.js");
const { serviceRepository } = await import("../../src/repositories/service.repository.js");
const { giftCardRepository } = await import("../../src/repositories/giftCard.repository.js");
const { getStorageProvider } = await import("../../src/integrations/storage/index.js");
const { renderGiftCardImage } = await import("../../src/services/gift-card-image.service.js");
const { notifyGiftCardCreated } = await import("../../src/services/notification.service.js");
const { syncGiftCardToSheet } = await import("../../src/services/google-sheets-sync.service.js");
const {
  createGiftCard,
  confirmGiftCardPayment,
  finalizeGiftCardAfterPayment,
  validateGiftCard,
  redeemGiftCard,
  getGiftCardStatusByReference,
} = await import("../../src/services/gift-card.service.js");
const { NotFoundError, UnauthorizedError } = await import(
  "../../src/errors/index.js"
);

const BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
const SERVICE_ID = "22222222-2222-2222-2222-222222222222";
const GIFT_CARD_ID = "55555555-5555-5555-5555-555555555555";

describe("createGiftCard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si el negocio no existe", async () => {
    vi.mocked(businessRepository.findById).mockResolvedValue(null);

    await expect(
      createGiftCard({
        businessId: BUSINESS_ID,
        serviceId: SERVICE_ID,
        design: "clasico",
        buyerName: "Ana",
        buyerPhone: "+573001112233",
        recipientName: "Luis",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lanza NotFoundError si el servicio no existe o no está activo", async () => {
    vi.mocked(businessRepository.findById).mockResolvedValue({ id: BUSINESS_ID, settings: {} } as never);
    vi.mocked(serviceRepository.findActiveById).mockResolvedValue(null);

    await expect(
      createGiftCard({
        businessId: BUSINESS_ID,
        serviceId: SERVICE_ID,
        design: "clasico",
        buyerName: "Ana",
        buyerPhone: "+573001112233",
        recipientName: "Luis",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("crea la Gift Card PENDING con el monto del servicio y código GIFT-", async () => {
    vi.mocked(businessRepository.findById).mockResolvedValue({
      id: BUSINESS_ID,
      settings: { gift_card_validity_days: 30 },
    } as never);
    vi.mocked(serviceRepository.findActiveById).mockResolvedValue({ id: SERVICE_ID, price: 90000 } as never);
    vi.mocked(giftCardRepository.create).mockResolvedValue({ id: GIFT_CARD_ID } as never);

    await createGiftCard({
      businessId: BUSINESS_ID,
      serviceId: SERVICE_ID,
      design: "floral",
      buyerName: "Ana",
      buyerPhone: "300 111 2233",
      recipientName: "Luis",
    });

    const [data] = vi.mocked(giftCardRepository.create).mock.calls[0]!;
    expect(data.status).toBe("PENDING");
    expect(data.paymentStatus).toBe("PENDING");
    expect(data.amount).toBe(90000);
    expect(data.code).toMatch(/^GIFT-[A-Z0-9]{8}$/);
    expect(data.buyerPhone).toBe("3001112233");
    expect(data.expiresAt).toBeInstanceOf(Date);
  });

  it("reintenta con un nuevo código si hay colisión de unique constraint", async () => {
    vi.mocked(businessRepository.findById).mockResolvedValue({ id: BUSINESS_ID, settings: {} } as never);
    vi.mocked(serviceRepository.findActiveById).mockResolvedValue({ id: SERVICE_ID, price: 90000 } as never);
    const collision = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "5.20.0",
    });
    vi.mocked(giftCardRepository.create)
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce({ id: GIFT_CARD_ID } as never);

    const result = await createGiftCard({
      businessId: BUSINESS_ID,
      serviceId: SERVICE_ID,
      design: "clasico",
      buyerName: "Ana",
      buyerPhone: "+573001112233",
      recipientName: "Luis",
    });

    expect(giftCardRepository.create).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ id: GIFT_CARD_ID });
  });
});

describe("confirmGiftCardPayment", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function fakeTx() {
    return { giftCard: { findUnique: vi.fn() } } as never;
  }

  it("devuelve false si la Gift Card no existe", async () => {
    const tx = fakeTx();
    vi.mocked((tx as { giftCard: { findUnique: ReturnType<typeof vi.fn> } }).giftCard.findUnique).mockResolvedValue(
      null,
    );

    await expect(confirmGiftCardPayment(GIFT_CARD_ID, tx)).resolves.toBe(false);
  });

  it("es idempotente: no reconfirma si ya no está PENDING", async () => {
    const tx = fakeTx();
    vi.mocked((tx as { giftCard: { findUnique: ReturnType<typeof vi.fn> } }).giftCard.findUnique).mockResolvedValue({
      id: GIFT_CARD_ID,
      status: "PAID",
    });

    await expect(confirmGiftCardPayment(GIFT_CARD_ID, tx)).resolves.toBe(false);
  });
});

describe("finalizeGiftCardAfterPayment", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("genera la imagen, la sube, sincroniza y notifica", async () => {
    vi.mocked(giftCardRepository.findById).mockResolvedValue({
      id: GIFT_CARD_ID,
      businessId: BUSINESS_ID,
      code: "GIFT-ABC12345",
      pdfUrl: null,
      recipientName: "Luis",
      buyerName: "Ana",
      message: null,
      design: "clasico",
      service: { name: "Masaje" },
    } as never);
    vi.mocked(businessRepository.findById).mockResolvedValue({ id: BUSINESS_ID, name: "Demo Spa" } as never);
    const upload = vi.fn().mockResolvedValue(undefined);
    const getPublicUrl = vi.fn().mockReturnValue("https://storage.example/gift.png");
    vi.mocked(getStorageProvider).mockReturnValue({ upload, getPublicUrl, delete: vi.fn(), name: "s" } as never);

    await finalizeGiftCardAfterPayment(GIFT_CARD_ID);

    expect(renderGiftCardImage).toHaveBeenCalledWith(
      expect.objectContaining({ recipientName: "Luis", code: "GIFT-ABC12345" }),
    );
    expect(upload).toHaveBeenCalledWith(
      `${BUSINESS_ID}/GIFT-ABC12345.png`,
      expect.any(Buffer),
      "image/png",
    );
    expect(giftCardRepository.setPdfUrl).toHaveBeenCalledWith(GIFT_CARD_ID, "https://storage.example/gift.png");
    expect(syncGiftCardToSheet).toHaveBeenCalledWith(GIFT_CARD_ID);
    expect(notifyGiftCardCreated).toHaveBeenCalledWith(GIFT_CARD_ID, "https://storage.example/gift.png");
  });

  it("si falla la generación de imagen, igual notifica (con pdfUrl null)", async () => {
    vi.mocked(giftCardRepository.findById).mockResolvedValue({
      id: GIFT_CARD_ID,
      businessId: BUSINESS_ID,
      code: "GIFT-ABC12345",
      pdfUrl: null,
      service: {},
    } as never);
    vi.mocked(businessRepository.findById).mockResolvedValue({ id: BUSINESS_ID, name: "Demo Spa" } as never);
    vi.mocked(renderGiftCardImage).mockRejectedValueOnce(new Error("puppeteer crashed"));

    await finalizeGiftCardAfterPayment(GIFT_CARD_ID);

    expect(notifyGiftCardCreated).toHaveBeenCalledWith(GIFT_CARD_ID, null);
  });

  it("no lanza si la Gift Card no existe", async () => {
    vi.mocked(giftCardRepository.findById).mockResolvedValue(null);

    await expect(finalizeGiftCardAfterPayment(GIFT_CARD_ID)).resolves.toBeUndefined();
  });
});

describe("validateGiftCard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si el código no existe", async () => {
    vi.mocked(giftCardRepository.findByCodeGlobal).mockResolvedValue(null);

    await expect(validateGiftCard("GIFT-NOPE")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("es válida si está PAID/SENT y no expiró", async () => {
    vi.mocked(giftCardRepository.findByCodeGlobal).mockResolvedValue({
      status: "SENT",
      expiresAt: new Date(Date.now() + 86_400_000),
      service: { name: "Masaje" },
      recipientName: "Luis",
      buyerName: "Ana",
      amount: 90000,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);

    const result = await validateGiftCard("GIFT-ABC12345");

    expect(result.valid).toBe(true);
    expect(result.status).toBe("SENT");
  });

  it("no es válida si ya está REDEEMED", async () => {
    vi.mocked(giftCardRepository.findByCodeGlobal).mockResolvedValue({
      status: "REDEEMED",
      expiresAt: null,
      service: {},
      amount: 90000,
      createdAt: new Date(),
    } as never);

    const result = await validateGiftCard("GIFT-ABC12345");

    expect(result.valid).toBe(false);
    expect(result.status).toBe("REDEEMED");
  });

  it("no es válida si ya expiró, aunque el status siga PAID", async () => {
    vi.mocked(giftCardRepository.findByCodeGlobal).mockResolvedValue({
      status: "PAID",
      expiresAt: new Date(Date.now() - 1000),
      service: {},
      amount: 90000,
      createdAt: new Date(),
    } as never);

    const result = await validateGiftCard("GIFT-ABC12345");

    expect(result.valid).toBe(false);
    expect(result.status).toBe("EXPIRED");
  });
});

describe("redeemGiftCard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // El resto de comportamientos de redeemGiftCard (PIN correcto, ya canjeada,
  // expirada) se prueban en gift-card-redeem.test.ts — env.STAFF_PIN se lee
  // una sola vez al importar el módulo, así que no se puede alternar dentro
  // del mismo archivo de test.
  it("lanza UnauthorizedError si no hay STAFF_PIN configurado", async () => {
    await expect(redeemGiftCard("GIFT-ABC12345", "1234")).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("getGiftCardStatusByReference", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lanza NotFoundError si no hay Gift Card con esa referencia", async () => {
    vi.mocked(giftCardRepository.findByPaymentReference).mockResolvedValue(null);

    await expect(getGiftCardStatusByReference("PAY-NOPE")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("devuelve el estado resumido", async () => {
    vi.mocked(giftCardRepository.findByPaymentReference).mockResolvedValue({
      id: GIFT_CARD_ID,
      code: "GIFT-ABC12345",
      status: "SENT",
      paymentStatus: "PAID",
      recipientName: "Luis",
      amount: 90000,
      pdfUrl: "https://storage.example/gift.png",
    } as never);
    vi.mocked(giftCardRepository.findById).mockResolvedValue({
      service: { name: "Masaje" },
    } as never);

    const result = await getGiftCardStatusByReference("PAY-ABC12345");

    expect(result).toEqual({
      code: "GIFT-ABC12345",
      status: "SENT",
      paymentStatus: "PAID",
      serviceName: "Masaje",
      recipientName: "Luis",
      amount: "90000",
      pdfUrl: "https://storage.example/gift.png",
    });
  });
});
