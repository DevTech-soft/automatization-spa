import type { FastifyReply, FastifyRequest } from "fastify";
import { getBusinessParamsSchema } from "../validators/business.validator.js";
import { getBusinessBySlug } from "../services/business.service.js";

export async function getBusinessHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { slug } = getBusinessParamsSchema.parse(request.params);
  const business = await getBusinessBySlug(slug);
  reply.send({ data: business });
}
