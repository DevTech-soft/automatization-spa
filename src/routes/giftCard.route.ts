import type { FastifyInstance } from "fastify";
import {
  createGiftCardHandler,
  getGiftCardStatusHandler,
  redeemGiftCardHandler,
  validateGiftCardHandler,
} from "../controllers/giftCard.controller.js";

export async function giftCardRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/gift-cards", createGiftCardHandler);
  app.get("/api/gift-cards/status", getGiftCardStatusHandler);
  app.post("/api/gift-cards/validate", validateGiftCardHandler);
  app.post("/api/gift-cards/redeem", redeemGiftCardHandler);
}
