import type { ClientContactDto, UpsertContactInput } from "@spa/shared";
import type { ClientContact, Prisma } from "@spa/db";
import { clientContactRepository } from "../repositories/clientContact.repository.js";
import { adminBusinessRepository } from "../repositories/adminBusiness.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import { NotFoundError } from "../errors/index.js";
import { dateOnlyFromUTCDate, dateOnlyToUTCDate } from "../utils/datetime.js";
import { logger } from "../utils/logger.js";

/**
 * Contactos del dueño de cada negocio (docs/PANEL-OPERADOR.md §4). Lado CRM del
 * panel: con quién hablar cuando hay mora, soporte o renovación.
 */

function toDto(row: ClientContact): ClientContactDto {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    soldAt: row.soldAt ? dateOnlyFromUTCDate(row.soldAt) : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** `""` (campo vaciado en el formulario) → `null`. */
function nullify(value: string | undefined): string | null {
  return value ? value : null;
}

function toData(input: UpsertContactInput) {
  return {
    name: input.name,
    phone: nullify(input.phone),
    email: nullify(input.email),
    soldAt: input.soldAt ? dateOnlyToUTCDate(input.soldAt) : null,
    notes: nullify(input.notes),
  };
}

export async function listContacts(businessId: string): Promise<ClientContactDto[]> {
  const business = await adminBusinessRepository.findDetail(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }
  const rows = await clientContactRepository.listByBusiness(businessId);
  return rows.map(toDto);
}

export async function createContact(
  businessId: string,
  input: UpsertContactInput,
  actor: string,
): Promise<ClientContactDto> {
  const business = await adminBusinessRepository.findDetail(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  const row = await clientContactRepository.create(businessId, toData(input));
  const dto = toDto(row);

  await auditLogRepository.record({
    actor,
    action: "business.contact.create",
    businessId,
    after: dto as unknown as Prisma.InputJsonValue,
  });
  logger.info({ actor, businessId, contactId: dto.id }, "admin_contact_created");

  return dto;
}

/** El contacto tiene que pertenecer al negocio de la ruta: sin eso, un id ajeno cruzaría de tenant. */
async function requireContact(businessId: string, contactId: string): Promise<ClientContact> {
  const row = await clientContactRepository.find(contactId);
  if (!row || row.businessId !== businessId) {
    throw new NotFoundError("Contacto no encontrado.");
  }
  return row;
}

export async function updateContact(
  businessId: string,
  contactId: string,
  input: UpsertContactInput,
  actor: string,
): Promise<ClientContactDto> {
  const before = await requireContact(businessId, contactId);

  const row = await clientContactRepository.update(contactId, toData(input));
  const dto = toDto(row);

  await auditLogRepository.record({
    actor,
    action: "business.contact.update",
    businessId,
    before: toDto(before) as unknown as Prisma.InputJsonValue,
    after: dto as unknown as Prisma.InputJsonValue,
  });
  logger.info({ actor, businessId, contactId }, "admin_contact_updated");

  return dto;
}

export async function deleteContact(
  businessId: string,
  contactId: string,
  actor: string,
): Promise<void> {
  const before = await requireContact(businessId, contactId);
  await clientContactRepository.delete(contactId);

  await auditLogRepository.record({
    actor,
    action: "business.contact.delete",
    businessId,
    before: toDto(before) as unknown as Prisma.InputJsonValue,
  });
  logger.info({ actor, businessId, contactId }, "admin_contact_deleted");
}
