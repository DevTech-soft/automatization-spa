import { z } from "zod";

/**
 * Marca por negocio (docs/PANEL-OPERADOR.md §4 y §6.1 paso 2).
 *
 * Dos orígenes distintos, una sola superficie en el panel:
 * - Columnas de `Business`: `logoUrl`, `colorPrimary`, `colorSecondary`.
 * - JSON `Business.settings`: `agentEnabled` y `agent` (la persona con la que
 *   el agente de n8n contesta — ver `AgentForwarder.AgentSettings`).
 */

/** Persona/config del agente conversacional. Vive en `business.settings.agent`. */
export interface AgentSettings {
  nombreAgente?: string;
  tipoNegocio?: string;
  ciudad?: string;
  nombreEncargada?: string;
  horarioTexto?: string;
  sedesTexto?: string;
  politicaAbono?: string;
  politicaCancelacion?: string;
  metodosPago?: string;
}

/** Respuesta de `GET /admin/businesses/:id/branding`. */
export interface BusinessBranding {
  businessId: string;
  logoUrl: string | null;
  colorPrimary: string | null;
  colorSecondary: string | null;
  agentEnabled: boolean;
  agent: AgentSettings;
}

const shortText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Usa un color hex, ej. #4f46e5.")
  .optional()
  .or(z.literal(""));

/** Campos de la persona del agente. Todos opcionales; `""` limpia la clave. */
export const agentSettingsSchema = z
  .object({
    nombreAgente: shortText(60),
    tipoNegocio: shortText(60),
    ciudad: shortText(60),
    nombreEncargada: shortText(60),
    horarioTexto: shortText(400),
    sedesTexto: shortText(400),
    politicaAbono: shortText(400),
    politicaCancelacion: shortText(400),
    metodosPago: shortText(400),
  })
  .partial();

export const updateBrandingSchema = z
  .object({
    logoUrl: z.string().trim().url("URL inválida (debe empezar con http).").max(500).optional().or(z.literal("")),
    colorPrimary: hexColor,
    colorSecondary: hexColor,
    agentEnabled: z.boolean(),
    agent: agentSettingsSchema,
  })
  .partial();

export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;

/** Campos de `agent` que se piden en el panel, en orden de formulario. */
export const agentFieldOrder = [
  "nombreAgente",
  "tipoNegocio",
  "ciudad",
  "nombreEncargada",
  "horarioTexto",
  "sedesTexto",
  "politicaAbono",
  "politicaCancelacion",
  "metodosPago",
] as const satisfies readonly (keyof AgentSettings)[];
