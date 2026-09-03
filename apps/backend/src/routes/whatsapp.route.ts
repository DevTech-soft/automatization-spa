import type { FastifyInstance } from "fastify";
import { receiveWhatsAppMessageHandler, verifyWhatsAppWebhookHandler } from "../controllers/whatsapp.controller.js";

export async function whatsappRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/webhooks/whatsapp", verifyWhatsAppWebhookHandler);
  app.post("/api/webhooks/whatsapp", receiveWhatsAppMessageHandler);
}
