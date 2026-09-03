import { z } from "zod";

export const createPaymentSchema = z.object({
  entityType: z.enum(["APPOINTMENT", "GIFT_CARD"]),
  entityId: z.string().uuid("entityId debe ser un UUID válido."),
});
