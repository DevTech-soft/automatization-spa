import { schedule } from "node-cron";
import { expireStalePendingAppointments, sendUpcomingAppointmentReminders } from "../services/appointment.service.js";
import { logger } from "../utils/logger.js";

/**
 * Scheduler in-process (Fase 9). Sustituye al cron de n8n planteado en el
 * análisis de Fase 0 — el proyecto nunca desplegó n8n (ver "Rol de n8n" en
 * docs/ARCHITECTURE.md) y estos dos jobs son simples llamadas a lógica que ya
 * vive en el backend, así que un orquestador externo sería sobreingeniería
 * (sección 46). Se arranca solo desde server.ts, nunca desde app.ts, para que
 * los tests (que usan buildApp() sin levantar el proceso real) no disparen
 * jobs de fondo.
 */
export function startScheduledJobs(): void {
  // Cada 5 minutos: liberar el horario de reservas PENDING vencidas (sección 10).
  schedule("*/5 * * * *", () => {
    void expireStalePendingAppointments()
      .then((count) => {
        if (count > 0) logger.info({ count }, "cron_expired_appointments");
      })
      .catch((error: unknown) => logger.error({ error }, "cron_expire_appointments_failed"));
  });

  // Cada hora: recordatorios ~24h antes de la cita (sección 21). La ventana
  // de REMINDER_WINDOW_MINUTES (90min) cubre este intervalo sin dejar huecos.
  schedule("0 * * * *", () => {
    void sendUpcomingAppointmentReminders()
      .then((count) => {
        if (count > 0) logger.info({ count }, "cron_reminders_sent");
      })
      .catch((error: unknown) => logger.error({ error }, "cron_send_reminders_failed"));
  });

  logger.info("scheduled_jobs_started");
}
