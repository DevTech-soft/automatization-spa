import { z } from "zod";

export const availabilityQuerySchema = z.object({
  businessId: z.string().uuid("businessId debe ser un UUID válido."),
  serviceId: z.string().uuid("serviceId debe ser un UUID válido."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date debe tener formato YYYY-MM-DD."),
});
