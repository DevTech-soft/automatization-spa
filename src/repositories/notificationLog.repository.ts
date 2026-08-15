import type { NotificationChannel, NotificationType, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db/prisma.js";

type Db = PrismaClient | Prisma.TransactionClient;

export const notificationLogRepository = {
  /** Lanza P2002 si ya existe una fila para (entityType, entityId, type) — así se marca idempotencia. */
  create(
    data: { businessId: string; entityType: string; entityId: string; type: NotificationType; channel: NotificationChannel },
    db: Db = prisma,
  ) {
    return db.notificationLog.create({ data });
  },
};
