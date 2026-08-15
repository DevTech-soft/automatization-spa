import { z } from "zod";

export const createAppointmentSchema = z.object({
  businessId: z.string().uuid("businessId debe ser un UUID válido."),
  serviceId: z.string().uuid("serviceId debe ser un UUID válido."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date debe tener formato YYYY-MM-DD."),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "startTime debe tener formato HH:mm."),
  customerName: z.string().trim().min(2, "El nombre es muy corto.").max(120),
  customerPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{6,17}$/, "customerPhone debe ser un número de teléfono válido."),
  customerEmail: z.string().trim().email("customerEmail no es válido.").optional(),
  notes: z.string().trim().max(500).optional(),
});

export type CreateAppointmentBody = z.infer<typeof createAppointmentSchema>;

export const appointmentStatusQuerySchema = z.object({
  reference: z.string().trim().min(1, "reference es requerida."),
});
