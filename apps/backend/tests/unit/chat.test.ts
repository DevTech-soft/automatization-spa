import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/whatsAppMessage.repository.js", () => ({
  whatsAppMessageRepository: { listThreads: vi.fn(), listMessages: vi.fn(), findThreadContext: vi.fn() },
}));
vi.mock("../../src/repositories/adminBusiness.repository.js", () => ({
  adminBusinessRepository: { findDetail: vi.fn() },
}));

const { whatsAppMessageRepository } = await import("../../src/repositories/whatsAppMessage.repository.js");
const { adminBusinessRepository } = await import("../../src/repositories/adminBusiness.repository.js");
const { assertBusinessExists, getChat, listChats } = await import("../../src/services/chat.service.js");
const { NotFoundError } = await import("../../src/errors/index.js");

const BID = "11111111-1111-1111-1111-111111111111";
const PHONE = "573001112233";

function message(i: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `m${i}`,
    businessId: BID,
    phone: PHONE,
    direction: "INBOUND",
    source: "CUSTOMER",
    type: "text",
    body: `mensaje ${i}`,
    payload: null,
    contactName: null,
    waMessageId: null,
    // Más nuevo primero, como los devuelve el repositorio.
    createdAt: new Date(Date.UTC(2026, 9, 3, 12, 0, 0) - i * 60_000),
    ...overrides,
  };
}

describe("chat.service", () => {
  afterEach(() => vi.clearAllMocks());

  it("lista hilos prefiriendo el nombre de la clienta registrada al del perfil", async () => {
    vi.mocked(whatsAppMessageRepository.listThreads).mockResolvedValue([
      {
        phone: PHONE,
        lastBody: "hola",
        lastDirection: "INBOUND",
        lastSource: "CUSTOMER",
        lastMessageAt: new Date("2026-10-03T12:00:00Z"),
        messageCount: 4,
        contactName: "Mari ✨",
        customerId: "c1",
        customerName: "María Pérez",
        conversationState: "SELECTING_DATE",
        total: 31,
      },
    ]);

    const result = await listChats(BID, { page: 2, pageSize: 20, order: "desc" });

    expect(whatsAppMessageRepository.listThreads).toHaveBeenCalledWith(BID, { q: undefined, skip: 20, take: 20 });
    expect(result.total).toBe(31);
    expect(result.items[0]).toMatchObject({ displayName: "María Pérez", customerId: "c1", messageCount: 4 });
  });

  it("devuelve los mensajes del más viejo al más nuevo con opciones y URL", async () => {
    vi.mocked(whatsAppMessageRepository.listMessages).mockResolvedValue([
      message(0, { direction: "OUTBOUND", source: "BOT", type: "interactive", payload: { options: ["Masaje"] } }),
      message(1),
    ] as never);
    vi.mocked(whatsAppMessageRepository.findThreadContext).mockResolvedValue({ contactName: "Mari", customer: null });

    const chat = await getChat(BID, PHONE, {});

    expect(chat.messages.map((m) => m.id)).toEqual(["m1", "m0"]);
    expect(chat.messages[1]).toMatchObject({ options: ["Masaje"], url: null, source: "BOT" });
    expect(chat).toMatchObject({ displayName: "Mari", hasMore: false, nextBefore: null });
  });

  it("con más de 100 mensajes ofrece cargar los anteriores", async () => {
    const rows = Array.from({ length: 101 }, (_, i) => message(i));
    vi.mocked(whatsAppMessageRepository.listMessages).mockResolvedValue(rows as never);
    vi.mocked(whatsAppMessageRepository.findThreadContext).mockResolvedValue({ contactName: null, customer: null });

    const chat = await getChat(BID, PHONE, { before: "2026-10-04T00:00:00.000Z" });

    expect(whatsAppMessageRepository.listMessages).toHaveBeenCalledWith(BID, PHONE, {
      before: new Date("2026-10-04T00:00:00.000Z"),
      take: 101,
    });
    expect(chat.messages).toHaveLength(100);
    expect(chat.hasMore).toBe(true);
    // El cursor es el más viejo de la página que se muestra (m99).
    expect(chat.nextBefore).toBe(rows[99]!.createdAt.toISOString());
  });

  it("assertBusinessExists lanza NotFound para un negocio inexistente", async () => {
    vi.mocked(adminBusinessRepository.findDetail).mockResolvedValue(null);
    await expect(assertBusinessExists(BID)).rejects.toBeInstanceOf(NotFoundError);
  });
});
