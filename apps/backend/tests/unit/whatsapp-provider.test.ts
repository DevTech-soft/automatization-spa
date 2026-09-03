import { createHmac } from "node:crypto";
import { describe, expect, it, vi, afterEach } from "vitest";
import { MetaWhatsAppProvider } from "../../src/integrations/whatsapp/MetaWhatsAppProvider.js";

function textMessagePayload(overrides: Record<string, unknown> = {}) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { display_phone_number: "573000000000", phone_number_id: "123" },
              contacts: [{ profile: { name: "María" }, wa_id: "573001112233" }],
              messages: [{ from: "573001112233", type: "text", text: { body: "hola" }, ...overrides }],
            },
          },
        ],
      },
    ],
  };
}

function interactivePayload(replyKind: "list_reply" | "button_reply", id: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { display_phone_number: "573000000000" },
              messages: [
                {
                  from: "573001112233",
                  type: "interactive",
                  interactive: { [replyKind]: { id, title: "x" } },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("MetaWhatsAppProvider.parseIncomingMessage", () => {
  const provider = new MetaWhatsAppProvider({ accessToken: "t", phoneNumberId: "123" });

  it("parsea un mensaje de texto", () => {
    const result = provider.parseIncomingMessage(textMessagePayload());
    expect(result).toEqual({
      kind: "text",
      from: "573001112233",
      to: "573000000000",
      phoneNumberId: "123",
      text: "hola",
      contactName: "María",
    });
  });

  it("parsea una respuesta de lista interactiva", () => {
    const result = provider.parseIncomingMessage(interactivePayload("list_reply", "service-123"));
    expect(result).toMatchObject({ kind: "interactive_reply", from: "573001112233", replyId: "service-123" });
  });

  it("parsea una respuesta de botón interactivo", () => {
    const result = provider.parseIncomingMessage(interactivePayload("button_reply", "confirm"));
    expect(result).toMatchObject({ kind: "interactive_reply", replyId: "confirm" });
  });

  it("ignora actualizaciones de estado (statuses) sin mensajes", () => {
    const payload = {
      entry: [{ changes: [{ value: { metadata: { display_phone_number: "573000000000" }, statuses: [{}] } }] }],
    };
    expect(provider.parseIncomingMessage(payload)).toEqual({ kind: "ignored" });
  });

  it("ignora tipos de mensaje no soportados (ej. imagen)", () => {
    const payload = textMessagePayload({ type: "image", text: undefined, image: { id: "x" } });
    expect(provider.parseIncomingMessage(payload)).toEqual({ kind: "ignored" });
  });

  it("ignora payloads malformados sin lanzar", () => {
    expect(provider.parseIncomingMessage({})).toEqual({ kind: "ignored" });
    expect(provider.parseIncomingMessage(null)).toEqual({ kind: "ignored" });
    expect(provider.parseIncomingMessage("garbage")).toEqual({ kind: "ignored" });
  });
});

describe("MetaWhatsAppProvider.validateWebhookSignature", () => {
  const appSecret = "shh-secret";
  const provider = new MetaWhatsAppProvider({ accessToken: "t", phoneNumberId: "123", appSecret });

  it("acepta una firma válida", () => {
    const body = JSON.stringify({ hello: "world" });
    const signature = `sha256=${createHmac("sha256", appSecret).update(body, "utf8").digest("hex")}`;
    expect(provider.validateWebhookSignature(body, signature)).toBe(true);
  });

  it("rechaza una firma inválida", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(provider.validateWebhookSignature(body, "sha256=deadbeef")).toBe(false);
  });

  it("rechaza cuando no hay header de firma", () => {
    expect(provider.validateWebhookSignature("{}", undefined)).toBe(false);
  });

  it("permite el paso si no hay app secret configurado (con warning)", () => {
    const noSecretProvider = new MetaWhatsAppProvider({ accessToken: "t", phoneNumberId: "123" });
    expect(noSecretProvider.validateWebhookSignature("{}", undefined)).toBe(true);
  });
});

describe("MetaWhatsAppProvider envío de mensajes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sendText hace POST al endpoint de mensajes de Meta con el body correcto", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new MetaWhatsAppProvider({ accessToken: "token-123", phoneNumberId: "phone-1" });

    await provider.sendText("573001112233", "Hola");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/phone-1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token-123" }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toEqual({ messaging_product: "whatsapp", to: "573001112233", type: "text", text: { body: "Hola" } });
  });

  it("lanza si Meta responde con error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "bad request" }));
    const provider = new MetaWhatsAppProvider({ accessToken: "t", phoneNumberId: "123" });

    await expect(provider.sendText("573001112233", "Hola")).rejects.toThrow();
  });
});
