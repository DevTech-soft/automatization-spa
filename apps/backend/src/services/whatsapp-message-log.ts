import type { Prisma, WhatsAppMessageSource } from "@spa/db";
import type {
  IncomingWhatsAppMessage,
  InteractiveMessage,
  WhatsAppProvider,
} from "../integrations/whatsapp/index.js";
import { whatsAppMessageRepository } from "../repositories/whatsAppMessage.repository.js";
import { digitsOnly } from "../utils/phone.js";
import { logger } from "../utils/logger.js";

/**
 * Escribe la transcripción de WhatsApp (docs/PANEL-OPERADOR.md F7).
 *
 * Regla: registrar **nunca** rompe la conversación. Si la DB falla al guardar
 * un mensaje, se loguea y la clienta igual recibe su respuesta — perder una
 * línea del historial es mejor que dejarla sin contestar.
 *
 * El teléfono se guarda solo con dígitos: Meta lo manda sin "+" y las
 * notificaciones usan el de `customers`, que a veces lo trae.
 */

type OutboundSource = Exclude<WhatsAppMessageSource, "CUSTOMER">;
type Incoming = Exclude<IncomingWhatsAppMessage, { kind: "ignored" }>;

async function safeRecord(data: Prisma.WhatsAppMessageUncheckedCreateInput): Promise<void> {
  try {
    await whatsAppMessageRepository.create(data);
  } catch (error) {
    logger.warn(
      { err: error, businessId: data.businessId, direction: data.direction },
      "whatsapp_message_log_failed",
    );
  }
}

function describeIncoming(message: Incoming): { type: string; body: string; payload?: Prisma.InputJsonValue } {
  switch (message.kind) {
    case "text":
      return { type: "text", body: message.text };
    case "interactive_reply":
      return {
        type: "interactive_reply",
        body: message.replyTitle ?? message.replyId,
        payload: { replyId: message.replyId },
      };
    case "unsupported":
      return { type: message.messageType, body: `[${message.messageType}]` };
  }
}

export async function recordIncomingMessage(businessId: string, message: Incoming): Promise<void> {
  await safeRecord({
    businessId,
    phone: digitsOnly(message.from),
    direction: "INBOUND",
    source: "CUSTOMER",
    contactName: message.contactName ?? null,
    waMessageId: message.messageId ?? null,
    ...describeIncoming(message),
  });
}

function describeInteractive(message: InteractiveMessage): Prisma.InputJsonValue {
  return message.type === "list"
    ? {
        type: "list",
        button: message.buttonText,
        options: message.sections.flatMap((s) => s.rows.map((r) => r.title)),
      }
    : { type: "buttons", options: message.buttons.map((b) => b.title) };
}

/**
 * Envuelve un provider para que cada envío **exitoso** quede en la
 * transcripción. Un envío que Meta rechaza lanza antes de registrar: la
 * transcripción muestra lo que la clienta recibió, no lo que se intentó.
 */
export function withMessageLog(
  provider: WhatsAppProvider,
  businessId: string,
  source: OutboundSource,
): WhatsAppProvider {
  const record = (to: string, type: string, body: string, payload?: Prisma.InputJsonValue) =>
    safeRecord({
      businessId,
      phone: digitsOnly(to),
      direction: "OUTBOUND",
      source,
      type,
      body,
      ...(payload !== undefined ? { payload } : {}),
    });

  return {
    name: provider.name,
    parseIncomingMessage: (raw) => provider.parseIncomingMessage(raw),
    validateWebhookSignature: (rawBody, signature) => provider.validateWebhookSignature(rawBody, signature),

    async sendText(to, text) {
      await provider.sendText(to, text);
      await record(to, "text", text);
    },

    async sendTemplate(to, templateName, params) {
      await provider.sendTemplate(to, templateName, params);
      await record(to, "template", `[plantilla ${templateName}]`, { templateName, params });
    },

    async sendInteractiveMessage(to, message) {
      await provider.sendInteractiveMessage(to, message);
      await record(to, "interactive", message.bodyText, describeInteractive(message));
    },

    async sendDocument(to, documentUrl, caption) {
      await provider.sendDocument(to, documentUrl, caption);
      await record(to, "document", caption || "[documento]", { url: documentUrl });
    },
  };
}
