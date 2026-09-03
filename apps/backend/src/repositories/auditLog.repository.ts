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
};
