import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createGiftCardSchema,
  giftCardStatusQuerySchema,
  redeemGiftCardSchema,
  validateGiftCardSchema,
} from "../validators/giftCard.validator.js";
import {
  createGiftCard,
  getGiftCardStatusByReference,
  redeemGiftCard,
  validateGiftCard,
} from "../services/gift-card.service.js";

export async function createGiftCardHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = createGiftCardSchema.parse(request.body);
  const giftCard = await createGiftCard(body);
  reply.status(201).send({ data: giftCard });
}

export async function getGiftCardStatusHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { reference } = giftCardStatusQuerySchema.parse(request.query);
  const status = await getGiftCardStatusByReference(reference);
  reply.send({ data: status });
}

export async function validateGiftCardHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { code } = validateGiftCardSchema.parse(request.body);
  const result = await validateGiftCard(code);
  reply.send({ data: result });
}

export async function redeemGiftCardHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { code, staffPin } = redeemGiftCardSchema.parse(request.body);
  await redeemGiftCard(code, staffPin);
  reply.send({ data: { redeemed: true } });
}
