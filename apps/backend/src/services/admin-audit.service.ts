import type { AuditLogRow, AuditQuery, PaginatedResponse, PaginationQuery } from "@spa/shared";
import { paginate } from "@spa/shared";
import type { Prisma } from "@spa/db";
import { auditLogRepository } from "../repositories/auditLog.repository.js";

/**
 * Lectura de la bitácora (docs/PANEL-OPERADOR.md §9). Solo lectura a propósito:
 * un registro de auditoría que se puede editar o borrar desde el panel no sirve
 * como auditoría.
 */
export async function listAuditLogs(
  query: PaginationQuery,
  filters: AuditQuery,
): Promise<PaginatedResponse<AuditLogRow>> {
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.businessId ? { businessId: filters.businessId } : {}),
    // Prefijo, no igualdad: "business." trae create/update/activate/status.
    ...(filters.action ? { action: { startsWith: filters.action } } : {}),
    ...(filters.actor ? { actor: filters.actor } : {}),
  };

  const { rows, total } = await auditLogRepository.list(where, {
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

  const items: AuditLogRow[] = rows.map((row) => ({
    id: row.id,
    actor: row.actor,
    action: row.action,
    businessId: row.businessId,
    businessName: row.business?.name ?? null,
    before: row.before,
    after: row.after,
    createdAt: row.createdAt.toISOString(),
  }));

  return paginate(items, total, query);
}
