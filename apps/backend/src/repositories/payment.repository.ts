import type { Prisma, PrismaClient, PaymentStatus } from "@spa/db";
import { prisma } from "../db/prisma.js";

type Db = PrismaClient | Prisma.TransactionClient;

export const paymentRepository = {
  create(data: Prisma.PaymentUncheckedCreateInput, db: Db = prisma) {
    return db.payment.create({ data });
  },

  findByReference(reference: string, db: Db = prisma) {
    return db.payment.findUnique({ where: { reference } });
  },

  updateStatus(
    id: string,
    status: PaymentStatus,
    transactionId: string,
    rawResponse: Prisma.InputJsonValue,
    db: Db = prisma,
  ) {
    return db.payment.update({
      where: { id },
      data: { status, transactionId, rawResponse },
    });
  },
};
