import type { FastifyReply, FastifyRequest } from "fastify";
import { whatsappVerifyQuerySchema } from "../validators/whatsapp.validator.js";
import { handleIncomingWhatsAppMessage } from "../services/whatsapp-conversation.service.js";
import { getWhatsAppProvider } from "../integrations/whatsapp/index.js";
import { env } from "../config/env.js";
import { WebhookVerificationError } from "../errors/index.js";

/** Handshake GET que Meta dispara al configurar la URL del webhook. */
export async function verifyWhatsAppWebhookHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = whatsappVerifyQuerySchema.parse(request.query);

  if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === env.WHATSAPP_VERIFY_TOKEN && query["hub.challenge"]) {
    reply.status(200).type("text/plain").send(query["hub.challenge"]);
    return;
  }

  reply.status(403).send();
}

export async function receiveWhatsAppMessageHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const provider = getWhatsAppProvider();
  const signatureHeader = request.headers["x-hub-signature-256"];
  const signature = typeof signatureHeader === "string" ? signatureHeader : undefined;

  if (!provider.validateWebhookSignature(request.rawBody ?? "", signature)) {
    throw new WebhookVerificationError("Firma de webhook de WhatsApp inválida.");
  }

  await handleIncomingWhatsAppMessage(request.body);
  // Meta reintenta si no responde 200 rápido — ack siempre, los errores ya quedan loggeados adentro.
  reply.status(200).send({ received: true });
}
