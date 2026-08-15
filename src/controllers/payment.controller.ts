import type { FastifyReply, FastifyRequest } from "fastify";
import { createPaymentSchema } from "../validators/payment.validator.js";
import { createPayment, processPaymentWebhook } from "../services/payment.service.js";

export async function createPaymentHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = createPaymentSchema.parse(request.body);
  const result = await createPayment(body);
  reply.status(201).send({ data: result });
}

export async function paymentWebhookHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await processPaymentWebhook(request.body);
  // Confirmar recepción rápido y con 200: el proveedor reintenta si no lo hacemos,
  // y processPaymentWebhook ya es idempotente ante reintentos/duplicados.
  reply.status(200).send({ received: true });
}
