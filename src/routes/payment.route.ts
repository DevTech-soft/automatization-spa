import type { FastifyInstance } from "fastify";
import { createPaymentHandler, paymentWebhookHandler } from "../controllers/payment.controller.js";

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/payments/create", createPaymentHandler);
  app.post("/api/webhooks/payment", paymentWebhookHandler);
}
