import type { FastifyInstance } from "fastify";
import { requireInternalToken } from "../middlewares/internal-auth.js";
import { expireAppointmentsHandler, sendRemindersHandler } from "../controllers/internal.controller.js";

/**
 * Endpoints internos, no expuestos al público. Los dispara el scheduler
 * in-process del propio backend (src/jobs/scheduler.ts, Fase 9), pero quedan
 * disponibles para un trigger manual o un cron externo si hiciera falta
 * (ver "Rol de n8n" en docs/ARCHITECTURE.md).
 */
export async function internalRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/internal/jobs/expire-appointments",
    { preHandler: requireInternalToken },
    expireAppointmentsHandler,
  );
  app.post("/internal/jobs/send-reminders", { preHandler: requireInternalToken }, sendRemindersHandler);
}
