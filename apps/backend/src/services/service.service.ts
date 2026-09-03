import { serviceRepository } from "../repositories/service.repository.js";
import { businessRepository } from "../repositories/business.repository.js";
import { NotFoundError } from "../errors/index.js";
import type { Service } from "@spa/db";

export async function listServices(businessId: string): Promise<Service[]> {
  const business = await businessRepository.findById(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }
  return serviceRepository.findActiveByBusinessId(businessId);
}
