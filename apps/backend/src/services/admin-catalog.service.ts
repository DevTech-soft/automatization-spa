import type {
  BusinessHourDto,
  ServiceDto,
  UpdateBusinessHoursInput,
  UpdateServiceInput,
  UpsertServiceInput,
} from "@spa/shared";
import type { BusinessHour, Prisma } from "@spa/db";
import { serviceRepository, type ServiceWithUsage } from "../repositories/service.repository.js";
import { businessHourRepository } from "../repositories/businessHour.repository.js";
import { adminBusinessRepository } from "../repositories/adminBusiness.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import { ConflictError, NotFoundError } from "../errors/index.js";
import { logger } from "../utils/logger.js";

/**
 * Catálogo del negocio desde el panel: servicios y horarios de atención
 * (docs/PANEL-OPERADOR.md §6.1 pasos 3–4). Antes solo se cargaban por seed o
 * directo en la DB.
 */

/** Horario que se propone para un día que todavía no tiene fila. */
const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "18:00";

function toServiceDto(row: ServiceWithUsage): ServiceDto {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    durationMinutes: row.durationMinutes,
    capacity: row.capacity,
    active: row.active,
    appointmentsCount: row._count.appointments,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Lo que va al audit log: sin timestamps ni contadores, que cambian solos. */
function auditSnapshot(dto: ServiceDto) {
  const { createdAt: _c, updatedAt: _u, appointmentsCount: _a, ...rest } = dto;
  return rest as unknown as Prisma.InputJsonValue;
}

/** `""` (campo vaciado en el formulario) → `null`; `undefined` = no tocar. */
function nullify(value: string | undefined): string | null | undefined {
  return value === undefined ? undefined : value || null;
}

async function requireBusiness(businessId: string): Promise<void> {
  const business = await adminBusinessRepository.findDetail(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }
}

/** El servicio tiene que pertenecer al negocio de la ruta: sin eso, un id ajeno cruzaría de tenant. */
async function requireService(businessId: string, serviceId: string): Promise<ServiceWithUsage> {
  const row = await serviceRepository.find(serviceId);
  if (!row || row.businessId !== businessId) {
    throw new NotFoundError("Servicio no encontrado.");
  }
  return row;
}

// — Servicios —

export async function listCatalogServices(businessId: string): Promise<ServiceDto[]> {
  await requireBusiness(businessId);
  const rows = await serviceRepository.listByBusiness(businessId);
  return rows.map(toServiceDto);
}

export async function createCatalogService(
  businessId: string,
  input: UpsertServiceInput,
  actor: string,
): Promise<ServiceDto> {
  await requireBusiness(businessId);

  const row = await serviceRepository.create(businessId, {
    name: input.name,
    description: nullify(input.description) ?? null,
    price: input.price,
    durationMinutes: input.durationMinutes,
    capacity: input.capacity,
    active: input.active,
  });
  const dto = toServiceDto(row);

  await auditLogRepository.record({
    actor,
    action: "business.service.create",
    businessId,
    after: auditSnapshot(dto),
  });
  logger.info({ actor, businessId, serviceId: dto.id }, "admin_service_created");

  return dto;
}

/**
 * Cambiar precio o duración no toca las citas ya agendadas: cada `Appointment`
 * guarda su propio precio y hora de fin al crearse.
 */
export async function updateCatalogService(
  businessId: string,
  serviceId: string,
  input: UpdateServiceInput,
  actor: string,
): Promise<ServiceDto> {
  const before = await requireService(businessId, serviceId);

  const row = await serviceRepository.update(serviceId, {
    name: input.name,
    description: nullify(input.description),
    price: input.price,
    durationMinutes: input.durationMinutes,
    capacity: input.capacity,
    active: input.active,
  });
  const dto = toServiceDto(row);

  await auditLogRepository.record({
    actor,
    action: "business.service.update",
    businessId,
    before: auditSnapshot(toServiceDto(before)),
    after: auditSnapshot(dto),
  });
  logger.info({ actor, businessId, serviceId }, "admin_service_updated");

  return dto;
}

/**
 * Solo se borra un servicio sin citas (la FK de `Appointment` es `Restrict`).
 * Con historial se desactiva: deja de ofrecerse y las citas viejas siguen
 * apuntando a algo.
 */
export async function deleteCatalogService(
  businessId: string,
  serviceId: string,
  actor: string,
): Promise<void> {
  const before = await requireService(businessId, serviceId);
  if (before._count.appointments > 0) {
    throw new ConflictError(
      `El servicio tiene ${before._count.appointments} cita(s) registrada(s). Desactívalo en vez de eliminarlo.`,
    );
  }

  await serviceRepository.delete(serviceId);

  await auditLogRepository.record({
    actor,
    action: "business.service.delete",
    businessId,
    before: auditSnapshot(toServiceDto(before)),
  });
  logger.info({ actor, businessId, serviceId }, "admin_service_deleted");
}

// — Horarios —

/** Siempre los 7 días, domingo primero; los que no tienen fila salen cerrados. */
function toWeek(rows: BusinessHour[]): BusinessHourDto[] {
  const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const row = byDay.get(dayOfWeek);
    return row
      ? { dayOfWeek, openTime: row.openTime, closeTime: row.closeTime, active: row.active }
      : { dayOfWeek, openTime: DEFAULT_OPEN, closeTime: DEFAULT_CLOSE, active: false };
  });
}

export async function getBusinessHours(businessId: string): Promise<BusinessHourDto[]> {
  await requireBusiness(businessId);
  return toWeek(await businessHourRepository.listByBusiness(businessId));
}

/**
 * Guarda la semana. No reprograma ni cancela citas ya agendadas fuera del
 * nuevo horario: eso lo decide el negocio con su clienta.
 */
export async function updateBusinessHours(
  businessId: string,
  input: UpdateBusinessHoursInput,
  actor: string,
): Promise<BusinessHourDto[]> {
  await requireBusiness(businessId);

  const before = toWeek(await businessHourRepository.listByBusiness(businessId));
  await businessHourRepository.saveWeek(businessId, input.days);
  const after = toWeek(await businessHourRepository.listByBusiness(businessId));

  await auditLogRepository.record({
    actor,
    action: "business.hours.update",
    businessId,
    before: before as unknown as Prisma.InputJsonValue,
    after: after as unknown as Prisma.InputJsonValue,
  });
  logger.info({ actor, businessId }, "admin_business_hours_updated");

  return after;
}
