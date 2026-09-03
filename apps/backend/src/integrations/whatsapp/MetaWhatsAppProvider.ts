import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "../../utils/logger.js";
import type {
  IncomingWhatsAppMessage,
  InteractiveMessage,
  WhatsAppProvider,
} from "./WhatsAppProvider.js";

export interface MetaWhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  /** Firma los webhooks entrantes (`X-Hub-Signature-256`). Ver nota en WhatsAppProvider.validateWebhookSignature. */
  appSecret?: string | undefined;
  apiBaseUrl?: string;
}

const DEFAULT_API_BASE_URL = "https://graph.facebook.com/v21.0";

function safeEqualHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/** Adapter de WhatsApp Business Cloud API (Meta). Ver docs/WHATSAPP.md. */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta";

  constructor(private readonly config: MetaWhatsAppConfig) {}

  async sendText(to: string, text: string): Promise<void> {
    await this.postMessage({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    });
  }

  async sendTemplate(to: string, templateName: string, params: string[]): Promise<void> {
    await this.postMessage({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "es_CO" },
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
      },
    });
  }

  async sendInteractiveMessage(to: string, message: InteractiveMessage): Promise<void> {
    const interactive =
      message.type === "list"
        ? {
            type: "list",
            body: { text: message.bodyText },
            action: { button: message.buttonText, sections: message.sections },
          }
        : {
            type: "button",
            body: { text: message.bodyText },
            action: {
              buttons: message.buttons.map((button) => ({
                type: "reply",
                reply: { id: button.id, title: button.title },
              })),
            },
          };

    await this.postMessage({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive,
    });
  }

  async sendDocument(to: string, documentUrl: string, caption?: string): Promise<void> {
    await this.postMessage({
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: { link: documentUrl, caption },
    });
  }

  parseIncomingMessage(rawPayload: unknown): IncomingWhatsAppMessage {
    const message = extractFirstMessage(rawPayload);
    const to = extractReceivingNumber(rawPayload);
    if (!message || !to) {
      return { kind: "ignored" };
    }

    const contactName = extractContactName(rawPayload);
    const phoneNumberId = extractPhoneNumberId(rawPayload);

    if (message.type === "text" && typeof message.text?.body === "string") {
      return { kind: "text", from: message.from, to, phoneNumberId, text: message.text.body, contactName };
    }

    const replyId = message.interactive?.list_reply?.id ?? message.interactive?.button_reply?.id;
    if (message.type === "interactive" && typeof replyId === "string") {
      return { kind: "interactive_reply", from: message.from, to, phoneNumberId, replyId, contactName };
    }

    // Otros tipos (imagen, audio, ubicación, etc.) — el bot determinístico no los soporta (sección 18).
    return { kind: "ignored" };
  }

  validateWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!this.config.appSecret) {
      logger.warn(
        "whatsapp_signature_validation_skipped: WHATSAPP_APP_SECRET no configurado, ver docs/WHATSAPP.md",
      );
      return true;
    }
    if (!signatureHeader?.startsWith("sha256=")) {
      return false;
    }

    const expected = createHmac("sha256", this.config.appSecret).update(rawBody, "utf8").digest("hex");
    const received = signatureHeader.slice("sha256=".length);
    return safeEqualHex(expected, received);
  }

  private async postMessage(body: Record<string, unknown>): Promise<void> {
    const baseUrl = this.config.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    const response = await fetch(`${baseUrl}/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ status: response.status, errorBody }, "whatsapp_send_failed");
      throw new Error(`No se pudo enviar el mensaje de WhatsApp (status ${response.status}).`);
    }
  }
}

interface MetaIncomingMessage {
  from: string;
  type: string;
  text?: { body?: string };
  interactive?: {
    list_reply?: { id?: string };
    button_reply?: { id?: string };
  };
}

function extractFirstMessage(rawPayload: unknown): MetaIncomingMessage | null {
  const value = getChangeValue(rawPayload);
  const messages = value?.["messages"];
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }
  const first = messages[0] as Record<string, unknown>;
  if (typeof first?.["from"] !== "string" || typeof first?.["type"] !== "string") {
    return null;
  }
  return first as unknown as MetaIncomingMessage;
}

function extractReceivingNumber(rawPayload: unknown): string | null {
  const value = getChangeValue(rawPayload);
  const metadata = value?.["metadata"] as Record<string, unknown> | undefined;
  const number = metadata?.["display_phone_number"];
  return typeof number === "string" ? number : null;
}

function extractPhoneNumberId(rawPayload: unknown): string | undefined {
  const value = getChangeValue(rawPayload);
  const metadata = value?.["metadata"] as Record<string, unknown> | undefined;
  const id = metadata?.["phone_number_id"];
  return typeof id === "string" ? id : undefined;
}

function extractContactName(rawPayload: unknown): string | undefined {
  const value = getChangeValue(rawPayload);
  const contacts = value?.["contacts"];
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return undefined;
  }
  const profile = (contacts[0] as Record<string, unknown>)?.["profile"] as Record<string, unknown> | undefined;
  const name = profile?.["name"];
  return typeof name === "string" ? name : undefined;
}

function getChangeValue(rawPayload: unknown): Record<string, unknown> | null {
  if (typeof rawPayload !== "object" || rawPayload === null) {
    return null;
  }
  const entry = (rawPayload as Record<string, unknown>)["entry"];
  if (!Array.isArray(entry) || entry.length === 0) {
    return null;
  }
  const changes = (entry[0] as Record<string, unknown>)?.["changes"];
  if (!Array.isArray(changes) || changes.length === 0) {
    return null;
  }
  const value = (changes[0] as Record<string, unknown>)?.["value"];
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}
