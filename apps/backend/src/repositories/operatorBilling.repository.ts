import type { OperatorInvoice, OperatorInvoiceStatus, Prisma } from "@spa/db";
import { prisma } from "../db/prisma.js";

/**
 * Cartera del operador: cuentas de cobro y pagos recibidos
 * (docs/PANEL-OPERADOR.md §6.4/§6.5). Invoices y payments viven en el mismo
 * repositorio porque toda la lógica interesante los toca juntos: registrar un
 * pago salda cuentas, y saldar cuentas mueve la vigencia del plan.
 */

const BUSINESS_SELECT = { select: { id: true, name: true, slug: true, status: true } } as const;

const INVOICE_INCLUDE = {
  business: BUSINESS_SELECT,
  payments: { select: { payment: { select: { id: true, paidAt: true, amount: true, method: true } } } },
} satisfies Prisma.OperatorInvoiceInclude;

const PAYMENT_INCLUDE = {
  business: BUSINESS_SELECT,
  invoices: { select: { invoice: { select: { id: true, number: true, total: true, status: true } } } },
} satisfies Prisma.OperatorPaymentInclude;

export type OperatorInvoiceRow = Prisma.OperatorInvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>;
export type OperatorPaymentRow = Prisma.OperatorPaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

interface ListParams {
  where: Prisma.OperatorInvoiceWhereInput;
  skip: number;
  take: number;
  orderBy: Prisma.OperatorInvoiceOrderByWithRelationInput;
}

export interface CreateInvoiceData {
  businessId: string;
  issuedAt: Date;
  dueAt: Date;
  periodFrom: Date;
  periodTo: Date;
  items: Prisma.InputJsonValue;
  subtotal: number;
  total: number;
  currency: string;
  status: OperatorInvoiceStatus;
}

export interface RegisterPaymentData {
  businessId: string;
  paidAt: Date;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  invoiceIds: string[];
}

export const operatorBillingRepository = {
  // ── Cuentas de cobro ──────────────────────────────────────────────────────

  async listInvoices({ where, skip, take, orderBy }: ListParams): Promise<{ rows: OperatorInvoiceRow[]; total: number }> {
    const [rows, total] = await prisma.$transaction([
      prisma.operatorInvoice.findMany({ where, orderBy, skip, take, include: INVOICE_INCLUDE }),
      prisma.operatorInvoice.count({ where }),
    ]);
    return { rows, total };
  },

  findInvoice(id: string): Promise<OperatorInvoiceRow | null> {
    return prisma.operatorInvoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
  },

  /**
   * Emite una cuenta de cobro con consecutivo `CC-<año>-<NNN>`.
   *
   * El consecutivo se calcula dentro de la transacción bajo un
   * `pg_advisory_xact_lock` sobre el año: dos emisiones simultáneas no pueden
   * leer el mismo `count` y chocar contra el índice único de `number`. Es el
   * mismo patrón que la reserva de cupo (§ARCHITECTURE "Modelo de recursos").
   */
  createInvoice(data: CreateInvoiceData): Promise<OperatorInvoiceRow> {
    const year = data.issuedAt.getUTCFullYear();
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`operator_invoice:${year}`})::bigint)`;

      const issued = await tx.operatorInvoice.count({ where: { number: { startsWith: `CC-${year}-` } } });
      const number = `CC-${year}-${String(issued + 1).padStart(3, "0")}`;

      const created = await tx.operatorInvoice.create({
        data: {
          number,
          businessId: data.businessId,
          issuedAt: data.issuedAt,
          dueAt: data.dueAt,
          periodFrom: data.periodFrom,
          periodTo: data.periodTo,
          items: data.items,
          subtotal: data.subtotal,
          taxes: 0,
          total: data.total,
          currency: data.currency,
          status: data.status,
        },
        select: { id: true },
      });
      return tx.operatorInvoice.findUniqueOrThrow({ where: { id: created.id }, include: INVOICE_INCLUDE });
    });
  },

  updateInvoiceStatus(id: string, status: OperatorInvoiceStatus): Promise<OperatorInvoiceRow> {
    return prisma.operatorInvoice.update({ where: { id }, data: { status }, include: INVOICE_INCLUDE });
  },

  /** ¿Ya hay una cuenta viva que cubra este período? Evita duplicar en el job diario. */
  findOverlapping(businessId: string, periodFrom: Date): Promise<OperatorInvoice | null> {
    return prisma.operatorInvoice.findFirst({
      where: {
        businessId,
        status: { notIn: ["VOID"] },
        periodTo: { gt: periodFrom },
      },
      orderBy: { periodTo: "desc" },
    });
  },

  /** Cuentas emitidas y sin pagar cuya fecha de vencimiento ya pasó. */
  findDueForOverdue(today: Date): Promise<OperatorInvoice[]> {
    return prisma.operatorInvoice.findMany({
      where: { status: "SENT", dueAt: { lt: today } },
      orderBy: { dueAt: "asc" },
    });
  },

  markOverdue(ids: string[]): Promise<Prisma.BatchPayload> {
    return prisma.operatorInvoice.updateMany({ where: { id: { in: ids } }, data: { status: "OVERDUE" } });
  },

  setInvoicePdf(id: string, pdfUrl: string): Promise<OperatorInvoice> {
    return prisma.operatorInvoice.update({ where: { id }, data: { pdfUrl } });
  },

  // ── Pagos recibidos ───────────────────────────────────────────────────────

  async listPayments({
    where,
    skip,
    take,
  }: {
    where: Prisma.OperatorPaymentWhereInput;
    skip: number;
    take: number;
  }): Promise<{ rows: OperatorPaymentRow[]; total: number }> {
    const [rows, total] = await prisma.$transaction([
      prisma.operatorPayment.findMany({
        where,
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        skip,
        take,
        include: PAYMENT_INCLUDE,
      }),
      prisma.operatorPayment.count({ where }),
    ]);
    return { rows, total };
  },

  findPayment(id: string): Promise<OperatorPaymentRow | null> {
    return prisma.operatorPayment.findUnique({ where: { id }, include: PAYMENT_INCLUDE });
  },

  /**
   * Registra el pago, lo enlaza con las cuentas que salda y las marca `PAID`,
   * todo en una transacción. La extensión de `validUntil` y la reactivación del
   * negocio se hacen en el mismo `tx` desde el servicio (`extra`), para que un
   * pago nunca quede registrado con la vigencia sin mover.
   */
  registerPayment(
    data: RegisterPaymentData,
    extra?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<OperatorPaymentRow> {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.operatorPayment.create({
        data: {
          businessId: data.businessId,
          paidAt: data.paidAt,
          amount: data.amount,
          currency: data.currency,
          method: data.method,
          reference: data.reference,
        },
        select: { id: true },
      });

      if (data.invoiceIds.length > 0) {
        await tx.operatorPaymentInvoice.createMany({
          data: data.invoiceIds.map((invoiceId) => ({ paymentId: payment.id, invoiceId })),
          skipDuplicates: true,
        });
        await tx.operatorInvoice.updateMany({
          where: { id: { in: data.invoiceIds }, status: { notIn: ["VOID"] } },
          data: { status: "PAID" },
        });
      }

      if (extra) {
        await extra(tx);
      }

      return tx.operatorPayment.findUniqueOrThrow({ where: { id: payment.id }, include: PAYMENT_INCLUDE });
    });
  },

  setPaymentPdf(id: string, pdfUrl: string) {
    return prisma.operatorPayment.update({ where: { id }, data: { pdfUrl } });
  },

  /** Cuentas de un negocio que siguen pendientes de cobro. */
  findOutstandingByBusiness(businessId: string): Promise<OperatorInvoice[]> {
    return prisma.operatorInvoice.findMany({
      where: { businessId, status: { in: ["SENT", "OVERDUE"] } },
      orderBy: { dueAt: "asc" },
    });
  },

  // ── Agregados para el dashboard ───────────────────────────────────────────

  countInvoicesByStatus() {
    return prisma.operatorInvoice.groupBy({ by: ["status"], _count: { _all: true } });
  },

  async sumInvoices(where: Prisma.OperatorInvoiceWhereInput): Promise<number> {
    const result = await prisma.operatorInvoice.aggregate({ where, _sum: { total: true } });
    return Number(result._sum.total ?? 0);
  },

  async sumPayments(where: Prisma.OperatorPaymentWhereInput): Promise<number> {
    const result = await prisma.operatorPayment.aggregate({ where, _sum: { amount: true } });
    return Number(result._sum.amount ?? 0);
  },

  countPaidInvoicesSince(from: Date): Promise<number> {
    return prisma.operatorInvoice.count({ where: { status: "PAID", updatedAt: { gte: from } } });
  },

  /** Pendiente de cobro agrupado por negocio — alimenta la columna de cartera. */
  outstandingByBusiness() {
    return prisma.operatorInvoice.groupBy({
      by: ["businessId"],
      where: { status: { in: ["SENT", "OVERDUE"] } },
      _sum: { total: true },
    });
  },
};
