import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

/**
 * Reenvío del canal de WhatsApp al agente conversacional de n8n
 * (ver docs/AGENTE-N8N.md).
 *
 * El backend sigue siendo el que recibe el webhook de Meta y valida la firma:
 * n8n nunca habla con Meta para recibir. Aquí solo se traduce el mensaje ya
 * parseado y con el tenant resuelto a un payload plano, para que el agente no
 * tenga que volver a interpretar el formato de Meta ni enrutar por
 * phone_number_id.
 */

/** Config del agente que vive en `business.settings.agent` (columna Json). */
export interface AgentSettings {
  nombreAgente?: string;
  tipoNegocio?: string;
  ciudad?: string;
  horarioTexto?: string;
  sedesTexto?: string;
  politicaAbono?: string;
  politicaCancelacion?: string;
  metodosPago?: string;
  nombreEncargada?: string;
  [key: string]: unknown;
}

/**
 * Algo que pasó en el backend y que el agente tiene que contarle a la clienta
 * (hoy: el negocio le canceló la cita). Viaja por el mismo webhook que los
 * mensajes; el workflow lo pone en el prompt del sistema, así que solo el
 * backend puede originarlo — una clienta que escriba "aviso del sistema" no.
 */
export interface AgentEvent {
  type: "appointment_cancelled";
  /** Qué tiene que decirle el agente, en español, listo para el prompt. */
  instruccion: string;
  cita: {
    codigo: string;
    servicio: string;
    fecha: string;
    inicio: string;
    estadoPago: string;
  };
}

export interface AgentForwardPayload {
  businessId: string;
  businessName: string;
  timezone: string;
  currency: string;
  /** Número normalizado de quien escribe (wa_id de Meta). */
  phone: string;
  contactName?: string | undefined;
  /**
   * Lo que escribió la clienta. En un evento lleva la misma instrucción con un
   * prefijo, para que un workflow que todavía no lee `event` igual funcione.
   */
  text: string;
  agent: AgentSettings;
  event?: AgentEvent | undefined;
}

interface BusinessSettingsShape {
  agentEnabled?: unknown;
  agent?: unknown;
}

function readSettings(settings: unknown): BusinessSettingsShape {
  return settings && typeof settings === "object" ? (settings as BusinessSettingsShape) : {};
}

/**
 * El agente es opt-in por negocio: mientras `settings.agentEnabled` no sea
 * `true`, ese negocio sigue con el bot determinístico. Así se migra un cliente
 * a la vez sin tocar a los demás.
 */
export function isAgentEnabled(settings: unknown): boolean {
  if (!env.N8N_AGENT_WEBHOOK_URL) {
    return false;
  }
  return readSettings(settings).agentEnabled === true;
}

export function readAgentSettings(settings: unknown): AgentSettings {
  const agent = readSettings(settings).agent;
  return agent && typeof agent === "object" ? (agent as AgentSettings) : {};
}

/**
 * Entrega el mensaje al agente. Devuelve `false` —sin lanzar— cuando n8n no
 * responde, no está configurado o contesta un status de error, para que el
 * llamador pueda caer al bot de menús: una caída de n8n degrada la
 * conversación, no la corta.
 */
export async function forwardToAgent(payload: AgentForwardPayload): Promise<boolean> {
  const url = env.N8N_AGENT_WEBHOOK_URL;
  if (!url) {
    return false;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.N8N_AGENT_TOKEN ? { "x-agent-token": env.N8N_AGENT_TOKEN } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(env.N8N_AGENT_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, businessId: payload.businessId },
        "agent_forward_rejected",
      );
      return false;
    }

    logger.info({ businessId: payload.businessId, phone: payload.phone }, "agent_forward_ok");
    return true;
  } catch (error) {
    logger.error({ error, businessId: payload.businessId }, "agent_forward_failed");
    return false;
  }
}
