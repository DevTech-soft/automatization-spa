import type { FastifyInstance } from "fastify";
import { requireInternalToken } from "../middlewares/internal-auth.js";
import { expireAppointmentsHandler } from "../controllers/internal.controller.js";

/**
 * Endpoints internos, no expuestos al público. Pensados para ser llamados por
 * el cron de n8n (workflow 11_cleanup_expired_appointments, Fase 9).
 */
export async function internalRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/internal/jobs/expire-appointments",
    { preHandler: requireInternalToken },
    expireAppointmentsHandler,
  );
}
