import type {
  BusinessDetail,
  BusinessListItem,
  CreateBusinessInput,
  PaginatedResponse,
  PaginationQuery,
  UpdateBusinessInput,
} from "@spa/shared";
import { paginate } from "@spa/shared";
import type { Prisma } from "@spa/db";
import {
  adminBusinessRepository,
  type AdminBusinessDetailRow,
  type AdminBusinessListRow,
} from "../repositories/adminBusiness.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import { NotFoundError, ValidationError } from "../errors/index.js";
import { logger } from "../utils/logger.js";

const SORTABLE = new Set(["name", "slug", "status", "createdAt"]);

function toListItem(row: AdminBusinessListRow): BusinessListItem {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    chargeMode: row.chargeMode,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetail(row: AdminBusinessDetailRow): BusinessDetail {
  return {
    ...toListItem(row),
    phone: row.phone,
    whatsappNumber: row.whatsappNumber,
    email: row.email,
    address: row.address,
    timezone: row.timezone,
    currency: row.currency,
    logoUrl: row.logoUrl,
    colorPrimary: row.colorPrimary,
    colorSecondary: row.colorSecondary,
    depositPercentage: row.depositPercentage,
    organizationId: row.organization?.id ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Normaliza `"" | undefined` → `null` para columnas nullable de texto. */
function nullify(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === "" ? null : value;
}

export async function listBusinesses(query: PaginationQuery): Promise<PaginatedResponse<BusinessListItem>> {
  const sortField = query.sort && SORTABLE.has(query.sort) ? query.sort : "createdAt";
  const { rows, total } = await adminBusinessRepository.list({
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
    q: query.q,
    orderBy: { [sortField]: query.order },
  });
  return paginate(rows.map(toListItem), total, query);
}

export async function getBusiness(id: string): Promise<BusinessDetail> {
  const row = await adminBusinessRepository.findDetail(id);
  if (!row) {
    throw new NotFoundError("Negocio no encontrado.");
  }
  return toDetail(row);
}

export async function createBusiness(input: CreateBusinessInput, actor: string): Promise<BusinessDetail> {
  const existing = await adminBusinessRepository.findBySlug(input.slug);
  if (existing) {
    throw new ValidationError(`Ya existe un negocio con el slug "${input.slug}".`);
  }

  const data: Prisma.BusinessCreateInput = {
    name: input.name,
    slug: input.slug,
    phone: nullify(input.phone) ?? undefined,
    whatsappNumber: nullify(input.whatsappNumber) ?? undefined,
    email: nullify(input.email) ?? undefined,
    address: nullify(input.address) ?? undefined,
    timezone: input.timezone,
    currency: input.currency,
    // Alta por panel: el negocio nace en `trial` (§5) hasta completar el onboarding.
    status: "TRIAL",
  };

  const row = await adminBusinessRepository.createWithOrganization(data);
  const detail = toDetail(row);

  await auditLogRepository.record({
    actor,
    action: "business.create",
    businessId: detail.id,
    after: detail as unknown as Prisma.InputJsonValue,
  });
  logger.info({ actor, businessId: detail.id, slug: detail.slug }, "admin_business_created");

  return detail;
}

export async function updateBusiness(
  id: string,
  input: UpdateBusinessInput,
  actor: string,
): Promise<BusinessDetail> {
  const before = await adminBusinessRepository.findDetail(id);
  if (!before) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  const chargeMode = input.chargeMode ?? before.chargeMode;
  const depositPercentage =
    input.depositPercentage !== undefined ? input.depositPercentage : before.depositPercentage;
  if (chargeMode === "DEPOSIT" && (depositPercentage == null || depositPercentage < 1 || depositPercentage > 99)) {
    throw new ValidationError("El modo de cobro 'abono' requiere un porcentaje entre 1 y 99.");
  }

  const data: Prisma.BusinessUpdateInput = {
    name: input.name,
    phone: nullify(input.phone),
    whatsappNumber: nullify(input.whatsappNumber),
    email: nullify(input.email),
    address: nullify(input.address),
    timezone: input.timezone,
    currency: input.currency,
    status: input.status,
    chargeMode: input.chargeMode,
    active: input.active,
    colorPrimary: nullify(input.colorPrimary),
    colorSecondary: nullify(input.colorSecondary),
    depositPercentage:
      input.chargeMode === "TOTAL"
        ? null
        : input.depositPercentage !== undefined
          ? input.depositPercentage
          : undefined,
  };

  const row = await adminBusinessRepository.update(id, data);
  const detail = toDetail(row);

  await auditLogRepository.record({
    actor,
    action: "business.update",
    businessId: id,
    before: toDetail(before) as unknown as Prisma.InputJsonValue,
    after: detail as unknown as Prisma.InputJsonValue,
  });
  logger.info({ actor, businessId: id }, "admin_business_updated");

  return detail;
}
