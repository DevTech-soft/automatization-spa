import { z } from "zod";
import { parseTimeInput } from "../utils/datetime.js";

/** Entradas de las herramientas del agente conversacional (ver docs/AGENTE-N8N.md). */

const businessId = z.string().uuid("businessId debe ser un UUID válido.");
const serviceId = z.string().uuid("serviceId debe ser un UUID válido.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date debe tener formato YYYY-MM-DD.");
// El agente ve las horas en 12 horas ("2:30 p. m.", ver agent.service) y suele
// devolverlas así; se acepta eso o "HH:mm" y se normaliza a "HH:mm".
const startTime = z.string().transform((value, ctx) => {
  const time = parseTimeInput(value);
  if (!time) {
    ctx.addIssue({ code: "custom", message: 'startTime debe ser una hora como "2:30 p. m." o "14:30".' });
    return z.NEVER;
  }
  return time;
});

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
