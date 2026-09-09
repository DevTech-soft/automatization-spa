import type { FastifyReply, FastifyRequest } from "fastify";
import { expireStalePendingAppointments, sendUpcomingAppointmentReminders } from "../services/appointment.service.js";
import { runBillingCycle } from "../services/billing-cycle.service.js";

export async function expireAppointmentsHandler(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const expiredCount = await expireStalePendingAppointments();
  reply.send({ data: { expiredCount } });
}

export async function sendRemindersHandler(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const remindersSent = await sendUpcomingAppointmentReminders();
  reply.send({ data: { remindersSent } });
}

/**
 * Ciclo de facturación diario (docs/PANEL-OPERADOR.md §6.4): emite las cuentas
 * del próximo período, marca las vencidas y suspende por mora. Lo dispara el
 * scheduler in-process; el endpoint queda para un cron externo o un trigger
 * manual, igual que los otros dos jobs.
 */
export async function billingCycleHandler(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const result = await runBillingCycle();
  reply.send({ data: result });
}
