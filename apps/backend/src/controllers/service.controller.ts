import type { FastifyReply, FastifyRequest } from "fastify";
import { listServicesQuerySchema } from "../validators/service.validator.js";
import { listServices } from "../services/service.service.js";

export async function listServicesHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { businessId } = listServicesQuerySchema.parse(request.query);
  const services = await listServices(businessId);
  reply.send({ data: services });
}
