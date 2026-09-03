import { z } from "zod";

/** Entradas de las herramientas del agente conversacional (ver docs/AGENTE-N8N.md). */

const businessId = z.string().uuid("businessId debe ser un UUID válido.");
const serviceId = z.string().uuid("serviceId debe ser un UUID válido.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date debe tener formato YYYY-MM-DD.");
const startTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "startTime debe tener formato HH:mm.");

export const agentServicesQuerySchema = z.object({ businessId });

export const agentAvailabilityQuerySchema = z.object({ businessId, serviceId, date });

export const agentAppointmentsQuerySchema = z.object({
  businessId,
  phone: z.string().trim().min(7, "phone es requerido."),
});

export const createAgentAppointmentSchema = z.object({
  businessId,
  serviceId,
  date,
  startTime,
  customerName: z.string().trim().min(2, "El nombre es muy corto.").max(120),
  customerPhone: z.string().trim().min(7, "customerPhone es requerido."),
  notes: z.string().trim().max(500).optional(),
});

export const agentReplySchema = z.object({
  businessId,
  phone: z.string().trim().min(7, "phone es requerido."),
  text: z.string().trim().min(1, "text es requerido.").max(4096),
});
