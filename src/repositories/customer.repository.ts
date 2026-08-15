import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db/prisma.js";

type Db = PrismaClient | Prisma.TransactionClient;

export const customerRepository = {
  /** Evita duplicar clientes del mismo negocio por teléfono (sección 6). */
  upsertByPhone(
    businessId: string,
    phone: string,
    data: { name: string; email?: string | undefined },
    db: Db = prisma,
  ) {
    return db.customer.upsert({
      where: { businessId_phone: { businessId, phone } },
      create: { businessId, phone, name: data.name, email: data.email },
      update: { name: data.name, email: data.email },
    });
  },
};
