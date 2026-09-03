import { z } from "zod";
import { GIFT_CARD_DESIGNS } from "../config/constants.js";

export const createGiftCardSchema = z.object({
  businessId: z.string().uuid("businessId debe ser un UUID válido."),
  serviceId: z.string().uuid("serviceId debe ser un UUID válido."),
  design: z.enum(GIFT_CARD_DESIGNS),
  buyerName: z.string().trim().min(2, "El nombre del comprador es muy corto.").max(120),
  buyerPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{6,17}$/, "buyerPhone debe ser un número de teléfono válido."),
  buyerEmail: z.string().trim().email("buyerEmail no es válido.").optional(),
  recipientName: z.string().trim().min(2, "El nombre del destinatario es muy corto.").max(120),
  recipientPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{6,17}$/, "recipientPhone debe ser un número de teléfono válido.")
    .optional(),
  recipientEmail: z.string().trim().email("recipientEmail no es válido.").optional(),
  message: z.string().trim().max(500).optional(),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "scheduledDate debe tener formato YYYY-MM-DD.")
    .optional(),
});

export type CreateGiftCardBody = z.infer<typeof createGiftCardSchema>;

export const giftCardStatusQuerySchema = z.object({
  reference: z.string().trim().min(1, "reference es requerida."),
});

export const validateGiftCardSchema = z.object({
  code: z.string().trim().min(1, "code es requerido."),
});

export const redeemGiftCardSchema = z.object({
  code: z.string().trim().min(1, "code es requerido."),
  staffPin: z.string().trim().min(1, "staffPin es requerido."),
});
