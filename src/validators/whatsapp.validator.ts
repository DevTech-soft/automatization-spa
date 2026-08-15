import { z } from "zod";

/** Nombres de query param literales que define Meta para el handshake del webhook. */
export const whatsappVerifyQuerySchema = z.object({
  "hub.mode": z.string().optional(),
  "hub.verify_token": z.string().optional(),
  "hub.challenge": z.string().optional(),
});
