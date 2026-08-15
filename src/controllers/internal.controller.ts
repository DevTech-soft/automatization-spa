import type { FastifyReply, FastifyRequest } from "fastify";
import { expireStalePendingAppointments } from "../services/appointment.service.js";

export async function expireAppointmentsHandler(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const expiredCount = await expireStalePendingAppointments();
  reply.send({ data: { expiredCount } });
}
