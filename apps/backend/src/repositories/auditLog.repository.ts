import type { Prisma } from "@spa/db";
import { prisma } from "../db/prisma.js";

/** Trazabilidad de acciones sensibles del panel (docs/PANEL-OPERADOR.md §9). */
export interface AuditEntry {
  actor: string;
  action: string;
  businessId?: string | undefined;
  before?: Prisma.InputJsonValue | undefined;
  after?: Prisma.InputJsonValue | undefined;
  metadata?: Prisma.InputJsonValue | undefined;
}

const LIST_INCLUDE = { business: { select: { name: true } } } satisfies Prisma.AuditLogInclude;

export type AuditLogListRow = Prisma.AuditLogGetPayload<{ include: typeof LIST_INCLUDE }>;

export const auditLogRepository = {
  record(entry: AuditEntry, db: Prisma.TransactionClient | typeof prisma = prisma) {
    return db.auditLog.create({
      data: {
        actor: entry.actor,
        action: entry.action,
        businessId: entry.businessId ?? null,
        before: entry.before,
        after: entry.after,
        metadata: entry.metadata,
      },
    });
  },

  /** Bitácora paginada para el panel (`GET /admin/audit-logs`). */
  async list(
    where: Prisma.AuditLogWhereInput,
    { skip, take }: { skip: number; take: number },
  ): Promise<{ rows: AuditLogListRow[]; total: number }> {
    const [rows, total] = await prisma.$transaction([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: LIST_INCLUDE }),
      prisma.auditLog.count({ where }),
    ]);
    return { rows, total };
  },
};
