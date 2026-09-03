import { z } from "zod";

export const listServicesQuerySchema = z.object({
  businessId: z.string().uuid("businessId debe ser un UUID válido."),
});
