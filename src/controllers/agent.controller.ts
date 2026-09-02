import type { FastifyReply, FastifyRequest } from "fastify";
import {
  agentAppointmentsQuerySchema,
  agentAvailabilityQuerySchema,
  agentReplySchema,
  agentServicesQuerySchema,
  createAgentAppointmentSchema,
} from "../validators/agent.validator.js";
import {
  createAgentAppointment,
  getAgentAvailability,
  listAgentAppointments,
  listAgentServices,
  sendAgentReply,
} from "../services/agent.service.js";

export async function agentServicesHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { businessId } = agentServicesQuerySchema.parse(request.query);
  const servicios = await listAgentServices(businessId);
  reply.send({ data: { servicios } });
}

export async function agentAvailabilityHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { businessId, serviceId, date } = agentAvailabilityQuerySchema.parse(request.query);
  const disponibilidad = await getAgentAvailability(businessId, serviceId, date);
  reply.send({ data: disponibilidad });
}

export async function agentListAppointmentsHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { businessId, phone } = agentAppointmentsQuerySchema.parse(request.query);
  const reservas = await listAgentAppointments(businessId, phone);
  reply.send({ data: { reservas } });
}

export async function agentCreateAppointmentHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = createAgentAppointmentSchema.parse(request.body);
  const result = await createAgentAppointment(body);
  // Siempre 200, incluso cuando `creada` es false: los rechazos de negocio son
  // información para la conversación, no fallos de la herramienta.
  reply.send({ data: result });
}

export async function agentReplyHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { businessId, phone, text } = agentReplySchema.parse(request.body);
  await sendAgentReply(businessId, phone, text);
  reply.send({ data: { enviado: true } });
}
