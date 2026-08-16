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
  // Límite más estricto que el global (100/min, app.ts): STAFF_PIN es corto
  // (4-6 dígitos, sección 42), así que el límite general no evita fuerza
  // bruta en un tiempo razonable (sección 29 — hardening de Fase 10).
  app.post(
    "/api/gift-cards/redeem",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    redeemGiftCardHandler,
  );
}
