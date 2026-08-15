import type { FastifyReply, FastifyRequest } from "fastify";
import { appointmentStatusQuerySchema, createAppointmentSchema } from "../validators/appointment.validator.js";
import { createAppointment, getAppointmentStatusByReference } from "../services/appointment.service.js";

export async function createAppointmentHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = createAppointmentSchema.parse(request.body);
  // Este endpoint es exclusivo del formulario web; WhatsApp (Fase 6) llamará
  // a createAppointment() directamente con source="WHATSAPP".
  const appointment = await createAppointment({ ...body, source: "WEB" });
  reply.status(201).send({ data: appointment });
}

export async function getAppointmentStatusHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { reference } = appointmentStatusQuerySchema.parse(request.query);
  const status = await getAppointmentStatusByReference(reference);
  reply.send({ data: status });
}
