import type {
  CreateInvoiceInput,
  InvoiceActionInput,
  InvoiceListQuery,
  OperatorInvoiceDetail,
  OperatorInvoiceListItem,
  OperatorPaymentListItem,
  PaginatedResponse,
  PaginationQuery,
  RegisterPaymentInput,
  InvoiceItem,
} from "@spa/shared";
import { paginate } from "@spa/shared";
import type { Prisma } from "@spa/db";
import {
  operatorBillingRepository,
  type OperatorInvoiceRow,
  type OperatorPaymentRow,
} from "../repositories/operatorBilling.repository.js";
import { adminBusinessRepository } from "../repositories/adminBusiness.repository.js";
import { subscriptionPlanRepository } from "../repositories/subscriptionPlan.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import { NotFoundError, ValidationError } from "../errors/index.js";
import {
  addCalendarDays,
  dateOnlyFromUTCDate,
  dateOnlyToUTCDate,
  daysBetween,
} from "../utils/datetime.js";
import { toMoney } from "../utils/money.js";
import { logger } from "../utils/logger.js";
import { getStorageProvider } from "../integrations/storage/index.js";
import { cycleDays, operatorToday, toSubscriptionDto } from "./admin-subscription.service.js";
import { formatPeriodLabel, renderInvoiceDocument } from "./operator-invoice-pdf.service.js";

/**
 * Cartera del operador (docs/PANEL-OPERADOR.md §6.4/§6.5): emitir cuentas de
 * cobro, registrar los pagos que entran, y mover la vigencia del plan y el
 * estado del negocio en consecuencia.
 *
 * La regla que ordena todo: **una cuenta de cobro no cambia nada por sí sola**;
 * lo que mueve `validUntil` y reactiva un negocio suspendido es el
 * `OperatorPayment`. Así un error al emitir se corrige anulando la cuenta, sin
 * tocar el servicio del cliente.
 */

/** Días entre la emisión y el vencimiento de una cuenta de cobro (§6.5). */
export const INVOICE_DUE_DAYS = 5;

// ── Serialización ───────────────────────────────────────────────────────────

function readItems(value: Prisma.JsonValue): InvoiceItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    return [
      {
        concept: String(item.concept ?? ""),
        period: String(item.period ?? ""),
        amount: Number(item.amount ?? 0),
      },
    ];
  });
}

function toInvoiceListItem(row: OperatorInvoiceRow, today = operatorToday()): OperatorInvoiceListItem {
  const dueAt = dateOnlyFromUTCDate(row.dueAt);
  const unpaid = row.status === "SENT" || row.status === "OVERDUE";
  const overdueDays = Math.round(daysBetween(dueAt, today));
  return {
    id: row.id,
    number: row.number,
    businessId: row.businessId,
    businessName: row.business.name,
    issuedAt: dateOnlyFromUTCDate(row.issuedAt),
    dueAt,
    total: toMoney(row.total),
    currency: row.currency,
    status: row.status,
    daysOverdue: unpaid && overdueDays > 0 ? overdueDays : 0,
  };
}

function toInvoiceDetail(row: OperatorInvoiceRow, today = operatorToday()): OperatorInvoiceDetail {
  return {
    ...toInvoiceListItem(row, today),
    periodFrom: dateOnlyFromUTCDate(row.periodFrom),
    periodTo: dateOnlyFromUTCDate(row.periodTo),
    items: readItems(row.items),
    subtotal: toMoney(row.subtotal),
    taxes: toMoney(row.taxes),
    pdfUrl: row.pdfUrl,
    createdAt: row.createdAt.toISOString(),
    payments: row.payments.map((link) => ({
      id: link.payment.id,
      businessId: row.businessId,
      businessName: row.business.name,
      paidAt: dateOnlyFromUTCDate(link.payment.paidAt),
      amount: toMoney(link.payment.amount),
      currency: row.currency,
      method: link.payment.method,
      reference: null,
      pdfUrl: null,
      invoiceNumbers: [row.number],
    })),
  };
}

function toPaymentListItem(row: OperatorPaymentRow): OperatorPaymentListItem {
  return {
    id: row.id,
    businessId: row.businessId,
    businessName: row.business.name,
    paidAt: dateOnlyFromUTCDate(row.paidAt),
    amount: toMoney(row.amount),
    currency: row.currency,
    method: row.method,
    reference: row.reference,
    pdfUrl: row.pdfUrl,
    invoiceNumbers: row.invoices.map((link) => link.invoice.number),
  };
}

// ── Cuentas de cobro ────────────────────────────────────────────────────────

export async function listInvoices(
  query: PaginationQuery,
  filters: InvoiceListQuery,
): Promise<PaginatedResponse<OperatorInvoiceListItem>> {
  const where: Prisma.OperatorInvoiceWhereInput = {
    ...(filters.businessId ? { businessId: filters.businessId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.outstanding && !filters.status ? { status: { in: ["SENT", "OVERDUE"] } } : {}),
    ...(query.q ? { OR: [{ number: { contains: query.q, mode: "insensitive" } }, { business: { name: { contains: query.q, mode: "insensitive" } } }] } : {}),
  };

  const { rows, total } = await operatorBillingRepository.listInvoices({
    where,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
    orderBy: { issuedAt: query.order },
  });

  const today = operatorToday();
  return paginate(rows.map((row) => toInvoiceListItem(row, today)), total, query);
}

export async function getInvoice(id: string): Promise<OperatorInvoiceDetail> {
  const row = await operatorBillingRepository.findInvoice(id);
  if (!row) {
    throw new NotFoundError("Cuenta de cobro no encontrada.");
  }
  return toInvoiceDetail(row);
}

/**
 * Emite una cuenta de cobro. Sin `items` explícitos la arma desde el plan del
 * negocio: una línea con el nombre del plan, el período que cubre y su precio.
 *
 * El período por defecto arranca donde termina la vigencia actual (`validUntil`),
 * que es exactamente lo que se le está cobrando: el ciclo siguiente.
 */
export async function createInvoice(
  businessId: string,
  input: CreateInvoiceInput,
  actor: string,
): Promise<OperatorInvoiceDetail> {
  const business = await adminBusinessRepository.findDetail(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  const plan = await subscriptionPlanRepository.findByBusinessId(businessId);
  const today = operatorToday();

  let items: InvoiceItem[];
  let periodFrom: string;
  let periodTo: string;

  if (input.items && input.items.length > 0) {
    items = input.items.map((item) => ({
      concept: item.concept,
      period: item.period ?? "",
      amount: item.amount,
    }));
    periodFrom = input.periodFrom ?? today;
    periodTo = input.periodTo ?? addCalendarDays(periodFrom, plan ? cycleDays(plan) : 30);
  } else {
    if (!plan) {
      throw new ValidationError(
        "El negocio no tiene un plan de suscripción. Créalo primero, o emite la cuenta con líneas manuales.",
      );
    }
    const currentValidUntil = dateOnlyFromUTCDate(plan.validUntil);
    periodFrom = input.periodFrom ?? currentValidUntil;
    periodTo = input.periodTo ?? addCalendarDays(periodFrom, cycleDays(plan));
    items = [
      {
        concept: `Plan ${plan.name}`,
        period: formatPeriodLabel(periodFrom, periodTo),
        amount: toMoney(plan.price),
      },
    ];
  }

  if (daysBetween(periodFrom, periodTo) <= 0) {
    throw new ValidationError("El período de la cuenta de cobro debe terminar después de empezar.");
  }

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  if (subtotal <= 0) {
    throw new ValidationError("El total de la cuenta de cobro debe ser mayor que cero.");
  }

  const issuedAt = input.issuedAt ?? today;
  const dueAt = input.dueAt ?? maxDate(periodFrom, addCalendarDays(issuedAt, INVOICE_DUE_DAYS));

  const row = await operatorBillingRepository.createInvoice({
    businessId,
    issuedAt: dateOnlyToUTCDate(issuedAt),
    dueAt: dateOnlyToUTCDate(dueAt),
    periodFrom: dateOnlyToUTCDate(periodFrom),
    periodTo: dateOnlyToUTCDate(periodTo),
    items: items as unknown as Prisma.InputJsonValue,
    subtotal,
    total: subtotal,
    currency: plan?.currency ?? business.currency,
    status: input.send ? "SENT" : "DRAFT",
  });

  const detail = toInvoiceDetail(row);
  await auditLogRepository.record({
    actor,
    action: "billing.invoice.create",
    businessId,
    after: detail as unknown as Prisma.InputJsonValue,
  });
  logger.info({ actor, businessId, number: detail.number, total: detail.total }, "admin_invoice_created");

  return detail;
}

/** La más tardía de dos fechas de calendario. */
function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Transiciones manuales: marcar como enviada, o anular. */
export async function applyInvoiceAction(
  id: string,
  input: InvoiceActionInput,
  actor: string,
): Promise<OperatorInvoiceDetail> {
  const row = await operatorBillingRepository.findInvoice(id);
  if (!row) {
    throw new NotFoundError("Cuenta de cobro no encontrada.");
  }
  if (row.status === "PAID") {
    throw new ValidationError("La cuenta ya está pagada. Anula el pago si necesitas corregirla.");
  }
  if (row.status === "VOID") {
    throw new ValidationError("La cuenta ya está anulada.");
  }
  if (input.action === "send" && row.status !== "DRAFT") {
    throw new ValidationError("Solo se envía una cuenta en borrador.");
  }

  const status = input.action === "send" ? "SENT" : "VOID";
  const updated = await operatorBillingRepository.updateInvoiceStatus(id, status);
  const detail = toInvoiceDetail(updated);

  await auditLogRepository.record({
    actor,
    action: `billing.invoice.${input.action}`,
    businessId: row.businessId,
    before: { status: row.status },
    after: { status, reason: input.reason || null },
  });
  logger.info({ actor, invoiceId: id, status }, "admin_invoice_status_changed");

  return detail;
}

// ── Pagos recibidos ─────────────────────────────────────────────────────────

export async function listPayments(
  query: PaginationQuery,
  filters: { businessId?: string | undefined },
): Promise<PaginatedResponse<OperatorPaymentListItem>> {
  const where: Prisma.OperatorPaymentWhereInput = filters.businessId
    ? { businessId: filters.businessId }
    : {};
  const { rows, total } = await operatorBillingRepository.listPayments({
    where,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });
  return paginate(rows.map(toPaymentListItem), total, query);
}

export interface RegisterPaymentResult {
  payment: OperatorPaymentListItem;
  /** Nueva vigencia del plan tras el pago, si el negocio tiene plan. */
  validUntil: string | null;
  /** Estado del negocio después del pago (puede haber pasado a `ACTIVE`). */
  businessStatus: string;
  reactivated: boolean;
}

/**
 * Registra un pago recibido (§6.4). En una sola transacción: crea el
 * `OperatorPayment`, salda las cuentas indicadas, extiende `validUntil` y —si
 * el negocio estaba en mora o suspendido y queda al día— lo reactiva.
 *
 * `TRIAL` no se toca: salir de la prueba es una decisión de onboarding
 * (`admin-onboarding.service`), no de cartera.
 */
export async function registerPayment(
  businessId: string,
  input: RegisterPaymentInput,
  actor: string,
): Promise<RegisterPaymentResult> {
  const business = await adminBusinessRepository.findDetail(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  const plan = await subscriptionPlanRepository.findByBusinessId(businessId);

  if (input.invoiceIds.length > 0) {
    const invoices = await operatorBillingRepository.findOutstandingByBusiness(businessId);
    const payable = new Set(invoices.map((invoice) => invoice.id));
    const invalid = input.invoiceIds.filter((id) => !payable.has(id));
    if (invalid.length > 0) {
      throw new ValidationError(
        "Alguna de las cuentas seleccionadas no está pendiente de cobro para este negocio.",
      );
    }
  }

  const today = operatorToday();
  const extendDays = input.extendDays ?? (plan ? cycleDays(plan) : 0);

  let nextValidUntil: string | null = null;
  if (plan && extendDays > 0) {
    const current = dateOnlyFromUTCDate(plan.validUntil);
    // Se extiende desde `validUntil` (el cliente paga el período que consumió,
    // aunque pague tarde). Si aun así el resultado quedaría en el pasado —mora
    // de varios ciclos— se ancla a hoy para no dejarlo suspendido tras pagar.
    const extended = addCalendarDays(current, extendDays);
    nextValidUntil = extended >= today ? extended : addCalendarDays(today, extendDays);
  } else if (plan) {
    nextValidUntil = dateOnlyFromUTCDate(plan.validUntil);
  }

  const reactivated =
    (business.status === "PAST_DUE" || business.status === "SUSPENDED") &&
    nextValidUntil !== null &&
    nextValidUntil >= today;

  const row = await operatorBillingRepository.registerPayment(
    {
      businessId,
      paidAt: dateOnlyToUTCDate(input.paidAt),
      amount: input.amount,
      currency: plan?.currency ?? business.currency,
      method: input.method,
      reference: input.reference || null,
      invoiceIds: input.invoiceIds,
    },
    async (tx) => {
      if (plan && nextValidUntil) {
        await subscriptionPlanRepository.update(
          businessId,
          { validUntil: dateOnlyToUTCDate(nextValidUntil) },
          tx,
        );
      }
      if (reactivated) {
        await adminBusinessRepository.updateStatus(businessId, "ACTIVE", tx);
      }
    },
  );

  const payment = toPaymentListItem(row);
  await auditLogRepository.record({
    actor,
    action: "billing.payment.register",
    businessId,
    before: { status: business.status, validUntil: plan ? dateOnlyFromUTCDate(plan.validUntil) : null },
    after: {
      status: reactivated ? "ACTIVE" : business.status,
      validUntil: nextValidUntil,
      amount: payment.amount,
      invoices: payment.invoiceNumbers,
    },
  });
  logger.info(
    { actor, businessId, amount: payment.amount, reactivated, validUntil: nextValidUntil },
    "admin_operator_payment_registered",
  );

  return {
    payment,
    validUntil: nextValidUntil,
    businessStatus: reactivated ? "ACTIVE" : business.status,
    reactivated,
  };
}

/** Cuentas pendientes de un negocio — el formulario de pago las ofrece para saldar. */
export async function listOutstandingInvoices(businessId: string): Promise<OperatorInvoiceListItem[]> {
  const rows = await operatorBillingRepository.listInvoices({
    where: { businessId, status: { in: ["SENT", "OVERDUE"] } },
    skip: 0,
    take: 50,
    orderBy: { dueAt: "asc" },
  });
  const today = operatorToday();
  return rows.rows.map((row) => toInvoiceListItem(row, today));
}

// ── PDF (§6.4: mismo pipeline Puppeteer → Storage de las Gift Cards) ────────

/**
 * Genera (o regenera) el PDF de una cuenta de cobro y lo deja en Storage.
 * Devuelve la URL pública, que queda guardada en la fila para no re-renderizar
 * en cada consulta — Puppeteer es caro y el documento no cambia.
 */
export async function generateInvoicePdf(id: string, actor: string): Promise<string> {
  const row = await operatorBillingRepository.findInvoice(id);
  if (!row) {
    throw new NotFoundError("Cuenta de cobro no encontrada.");
  }
  const business = await adminBusinessRepository.findDetail(row.businessId);
  const detail = toInvoiceDetail(row);

  const buffer = await renderInvoiceDocument({
    kind: "invoice",
    number: detail.number,
    issuedAt: detail.issuedAt,
    dueAt: detail.dueAt,
    clientName: detail.businessName,
    clientDocument: null,
    clientAddress: business?.address ?? null,
    clientEmail: business?.email ?? null,
    items: detail.items,
    subtotal: detail.subtotal,
    total: detail.total,
    currency: detail.currency,
  });

  const storage = getStorageProvider();
  const path = `operator/invoices/${detail.number}.pdf`;
  await storage.upload(path, buffer, "application/pdf");
  const pdfUrl = storage.getPublicUrl(path);
  await operatorBillingRepository.setInvoicePdf(id, pdfUrl);

  logger.info({ actor, invoiceId: id, number: detail.number }, "admin_invoice_pdf_generated");
  return pdfUrl;
}

/** Recibo del pago recibido: mismo template con el sello "PAGADO" (§6.5). */
export async function generateReceiptPdf(paymentId: string, actor: string): Promise<string> {
  const row = await operatorBillingRepository.findPayment(paymentId);
  if (!row) {
    throw new NotFoundError("Pago no encontrado.");
  }
  const business = await adminBusinessRepository.findDetail(row.businessId);
  const payment = toPaymentListItem(row);
  const number = `RC-${payment.paidAt.replace(/-/g, "")}-${paymentId.slice(0, 6).toUpperCase()}`;

  const buffer = await renderInvoiceDocument({
    kind: "receipt",
    number,
    issuedAt: payment.paidAt,
    dueAt: payment.paidAt,
    clientName: payment.businessName,
    clientAddress: business?.address ?? null,
    clientEmail: business?.email ?? null,
    items:
      payment.invoiceNumbers.length > 0
        ? row.invoices.map((link) => ({
            concept: `Cuenta de cobro ${link.invoice.number}`,
            period: "",
            amount: toMoney(link.invoice.total),
          }))
        : [{ concept: "Abono a la suscripción", period: "", amount: payment.amount }],
    subtotal: payment.amount,
    total: payment.amount,
    currency: payment.currency,
    paidAt: payment.paidAt,
    paymentMethod: payment.method,
    paymentReference: payment.reference,
  });

  const storage = getStorageProvider();
  const path = `operator/receipts/${number}.pdf`;
  await storage.upload(path, buffer, "application/pdf");
  const pdfUrl = storage.getPublicUrl(path);
  await operatorBillingRepository.setPaymentPdf(paymentId, pdfUrl);

  logger.info({ actor, paymentId, number }, "admin_receipt_pdf_generated");
  return pdfUrl;
}

/** Resumen de cartera de un negocio para su pestaña de suscripción. */
export async function getBusinessBillingSummary(businessId: string) {
  const [plan, outstanding, invoices, payments] = await Promise.all([
    subscriptionPlanRepository.findByBusinessId(businessId),
    listOutstandingInvoices(businessId),
    listInvoices({ page: 1, pageSize: 10, order: "desc" }, { businessId }),
    listPayments({ page: 1, pageSize: 5, order: "desc" }, { businessId }),
  ]);

  return {
    plan: plan ? toSubscriptionDto(plan) : null,
    outstanding,
    outstandingTotal: outstanding.reduce((sum, invoice) => sum + invoice.total, 0),
    invoices: invoices.items,
    payments: payments.items,
  };
}
