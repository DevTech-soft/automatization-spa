import type { FastifyReply, FastifyRequest } from "fastify";
import { availabilityQuerySchema } from "../validators/availability.validator.js";
import { getAvailability } from "../services/availability.service.js";

export async function getAvailabilityHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = availabilityQuerySchema.parse(request.query);
  const result = await getAvailability(query);
  reply.send({ data: result });
}
