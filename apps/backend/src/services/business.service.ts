import { businessRepository } from "../repositories/business.repository.js";
import { NotFoundError } from "../errors/index.js";
import { assertBusinessOperational } from "./business-guard.js";
import type { Business } from "@spa/db";

export async function getBusinessBySlug(slug: string): Promise<Business> {
  const business = await businessRepository.findBySlug(slug);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }
  assertBusinessOperational(business);
  return business;
}
