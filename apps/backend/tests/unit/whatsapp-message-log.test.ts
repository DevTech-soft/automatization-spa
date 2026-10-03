import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/whatsAppMessage.repository.js", () => ({
  whatsAppMessageRepository: { create: vi.fn() },
}));

const { whatsAppMessageRepository } = await import("../../src/repositories/whatsAppMessage.repository.js");
const { recordIncomingMessage, withMessageLog } = await import("../../src/services/whatsapp-message-log.js");

const BID = "11111111-1111-1111-1111-111111111111";

function fakeProvider() {
  return {
    name: "meta",
    sendText: vi.fn().mockResolvedValue(undefined),
    sendTemplate: vi.fn().mockResolvedValue(undefined),
    sendInteractiveMessage: vi.fn().mockResolvedValue(undefined),
    sendDocument: vi.fn().mockResolvedValue(undefined),
    parseIncomingMessage: vi.fn(),
    validateWebhookSignature: vi.fn().mockReturnValue(true),
  };
}

describe("whatsapp-message-log", () => {
  afterEach(() => vi.clearAllMocks());

  it("registra un entrante con el teléfono solo en dígitos y el wamid", async () => {
    await recordIncomingMessage(BID, {
      kind: "text",
      from: "+57 300 111 2233",
      to: "573000000000",
      text: "hola",
      messageId: "wamid.1",
      contactName: "María",
    });

    expect(whatsAppMessageRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: BID,
        phone: "573001112233",
        direction: "INBOUND",
        source: "CUSTOMER",
        type: "text",
        body: "hola",
        waMessageId: "wamid.1",
        contactName: "María",
      }),
    );
  });

  it("una respuesta interactiva se transcribe con el título de la opción", async () => {
    await recordIncomingMessage(BID, {
      kind: "interactive_reply",
      from: "573001112233",
      to: "573000000000",
      replyId: "svc-1",
      replyTitle: "Masaje relajante",
    });

    expect(whatsAppMessageRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "interactive_reply", body: "Masaje relajante", payload: { replyId: "svc-1" } }),
    );
  });

  it("registra los salientes exitosos con su origen y las opciones de la lista", async () => {
    const inner = fakeProvider();
    const provider = withMessageLog(inner as never, BID, "BOT");

    await provider.sendText("573001112233", "¿Cuál es tu nombre?");
    await provider.sendInteractiveMessage("573001112233", {
      type: "list",
      bodyText: "Elige un servicio",
      buttonText: "Ver",
      sections: [{ rows: [{ id: "a", title: "Masaje" }, { id: "b", title: "Facial" }] }],
    });

    expect(inner.sendText).toHaveBeenCalledWith("573001112233", "¿Cuál es tu nombre?");
    expect(whatsAppMessageRepository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ direction: "OUTBOUND", source: "BOT", type: "text", body: "¿Cuál es tu nombre?" }),
    );
    expect(whatsAppMessageRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "interactive",
        body: "Elige un servicio",
        payload: { type: "list", button: "Ver", options: ["Masaje", "Facial"] },
      }),
    );
  });

  it("un envío que falla no se registra y el error sube", async () => {
    const inner = fakeProvider();
    inner.sendText.mockRejectedValue(new Error("meta 500"));
    const provider = withMessageLog(inner as never, BID, "AGENT");

    await expect(provider.sendText("573001112233", "hola")).rejects.toThrow("meta 500");
    expect(whatsAppMessageRepository.create).not.toHaveBeenCalled();
  });

  it("si la DB falla al registrar, el envío igual se considera hecho", async () => {
    vi.mocked(whatsAppMessageRepository.create).mockRejectedValue(new Error("db down"));
    const inner = fakeProvider();
    const provider = withMessageLog(inner as never, BID, "NOTIFICATION");

    await expect(provider.sendText("573001112233", "Tu cita quedó confirmada")).resolves.toBeUndefined();
    await expect(
      recordIncomingMessage(BID, { kind: "text", from: "573001112233", to: "1", text: "hola" }),
    ).resolves.toBeUndefined();
  });
});
