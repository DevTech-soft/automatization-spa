import type { FastifyReply, FastifyRequest } from "fastify";
import { expireStalePendingAppointments, sendUpcomingAppointmentReminders } from "../services/appointment.service.js";

export async function expireAppointmentsHandler(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const expiredCount = await expireStalePendingAppointments();
  reply.send({ data: { expiredCount } });
}

export async function sendRemindersHandler(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const remindersSent = await sendUpcomingAppointmentReminders();
  reply.send({ data: { remindersSent } });
}
