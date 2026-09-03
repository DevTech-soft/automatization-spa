import { serviceRepository } from "../repositories/service.repository.js";
import { businessRepository } from "../repositories/business.repository.js";
import { NotFoundError } from "../errors/index.js";
import { assertBusinessOperational } from "./business-guard.js";
import type { Service } from "@spa/db";

export async function listServices(businessId: string): Promise<Service[]> {
  const business = await businessRepository.findById(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }
  assertBusinessOperational(business);
  return serviceRepository.findActiveByBusinessId(businessId);
}
