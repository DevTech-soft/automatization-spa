import type { FastifyInstance } from "fastify";
import { requireAgentToken } from "../middlewares/internal-auth.js";
import {
  agentAvailabilityHandler,
  agentCreateAppointmentHandler,
  agentListAppointmentsHandler,
  agentReplyHandler,
  agentServicesHandler,
} from "../controllers/agent.controller.js";

/**
 * Herramientas del agente conversacional de n8n. No son públicas: en Railway
 * n8n las llama por la red privada del proyecto y el token compartido
 * (N8N_AGENT_TOKEN) es la segunda barrera. Ver docs/AGENTE-N8N.md.
 */
export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/internal/agent/services", { preHandler: requireAgentToken }, agentServicesHandler);
  app.get("/internal/agent/availability", { preHandler: requireAgentToken }, agentAvailabilityHandler);
  app.get("/internal/agent/appointments", { preHandler: requireAgentToken }, agentListAppointmentsHandler);
  app.post("/internal/agent/appointments", { preHandler: requireAgentToken }, agentCreateAppointmentHandler);
  app.post("/internal/agent/reply", { preHandler: requireAgentToken }, agentReplyHandler);
}
