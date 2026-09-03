import type { Prisma, PrismaClient } from "@spa/db";
import { prisma } from "../db/prisma.js";

type Db = PrismaClient | Prisma.TransactionClient;

export const giftCardRepository = {
  create(data: Prisma.GiftCardUncheckedCreateInput, db: Db = prisma) {
    return db.giftCard.create({ data, include: { service: true } });
  },

  findById(id: string, db: Db = prisma) {
    return db.giftCard.findUnique({ where: { id }, include: { service: true } });
  },

  findByIdWithDetails(id: string, db: Db = prisma) {
    return db.giftCard.findUnique({ where: { id }, include: { service: true, business: true } });
  },

  findByCode(businessId: string, code: string, db: Db = prisma) {
    return db.giftCard.findFirst({ where: { businessId, code }, include: { service: true } });
  },

  /** Busca por código sin restringir por negocio — usado por /validar (sección 16), que no conoce el negocio de antemano. */
  findByCodeGlobal(code: string, db: Db = prisma) {
    return db.giftCard.findUnique({ where: { code }, include: { service: true, business: true } });
  },

  findByPaymentReference(paymentReference: string, db: Db = prisma) {
    return db.giftCard.findFirst({ where: { paymentReference } });
  },

  setPaymentReference(id: string, paymentReference: string, db: Db = prisma) {
    return db.giftCard.update({ where: { id }, data: { paymentReference } });
  },

  /**
   * Confirma el pago (sección 15). El código único ya se generó al crear la
   * Gift Card (mismo patrón que `appointment_code` — ver docs/GIFT-CARDS.md
   * para el porqué de esta desviación del orden literal de la sección 15).
   */
  confirmPayment(id: string, db: Db = prisma) {
    return db.giftCard.update({
      where: { id },
      data: { status: "PAID", paymentStatus: "PAID" },
      include: { service: true },
    });
  },

  setPdfUrl(id: string, pdfUrl: string, db: Db = prisma) {
    return db.giftCard.update({ where: { id }, data: { pdfUrl } });
  },

  markSent(id: string, db: Db = prisma) {
    return db.giftCard.update({ where: { id }, data: { status: "SENT" } });
  },

  /** Canje atómico (sección 16): solo transiciona si sigue PAID/SENT — impide doble canje bajo concurrencia. */
  async redeemIfValid(code: string, db: Db = prisma): Promise<boolean> {
    const result = await db.giftCard.updateMany({
      where: { code, status: { in: ["PAID", "SENT"] } },
      data: { status: "REDEEMED", redeemedAt: new Date() },
    });
    return result.count > 0;
  },
};
