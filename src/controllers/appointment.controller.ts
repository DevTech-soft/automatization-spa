import type { FastifyReply, FastifyRequest } from "fastify";
import { createAppointmentSchema } from "../validators/appointment.validator.js";
import { createAppointment } from "../services/appointment.service.js";

export async function createAppointmentHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = createAppointmentSchema.parse(request.body);
  // Este endpoint es exclusivo del formulario web; WhatsApp (Fase 6) llamará
  // a createAppointment() directamente con source="WHATSAPP".
  const appointment = await createAppointment({ ...body, source: "WEB" });
  reply.status(201).send({ data: appointment });
}
