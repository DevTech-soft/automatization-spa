import { z } from "zod";

/**
 * Cartera del operador: cuentas de cobro emitidas a cada negocio y los pagos
 * recibidos (docs/PANEL-OPERADOR.md §6.4 y §6.5).
 *
 * "Cuenta de cobro", no "factura": el operador es persona natural sin registro
 * mercantil (D7), así que no hay IVA ni numeración DIAN. `taxes` queda en 0 y el
 * consecutivo es interno (`CC-2026-001`).
 */

export const invoiceStatusValues = ["DRAFT", "SENT", "PAID", "OVERDUE", "VOID"] as const;
export type OperatorInvoiceStatus = (typeof invoiceStatusValues)[number];

export const INVOICE_STATUS_LABEL: Record<OperatorInvoiceStatus, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  VOID: "Anulada",
};

/** Una línea de la cuenta de cobro: "Plan mensual · sep 2 – oct 2 · $50.000". */
export interface InvoiceItem {
  concept: string;
  period: string;
  amount: number;
}

export interface OperatorInvoiceListItem {
  id: string;
  number: string;
  businessId: string;
  businessName: string;
  issuedAt: string;
  dueAt: string;
  total: number;
  currency: string;
  status: OperatorInvoiceStatus;
  /** Días vencida (0 si aún no vence). */
  daysOverdue: number;
}

export interface OperatorInvoiceDetail extends OperatorInvoiceListItem {
  periodFrom: string;
  periodTo: string;
  items: InvoiceItem[];
  subtotal: number;
  taxes: number;
  pdfUrl: string | null;
  createdAt: string;
  payments: OperatorPaymentListItem[];
}

export interface OperatorPaymentListItem {
  id: string;
  businessId: string;
  businessName: string;
  paidAt: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  pdfUrl: string | null;
  /** Números de las cuentas de cobro que saldó este pago. */
  invoiceNumbers: string[];
}

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.");

const invoiceItemSchema = z.object({
  concept: z.string().trim().min(2).max(120),
  period: z.string().trim().max(80).optional().or(z.literal("")),
  amount: z.coerce.number().min(0).max(99_999_999),
});

/**
 * `POST /admin/businesses/:id/invoices` — emite una cuenta de cobro.
 * Todo es opcional salvo cuando el negocio no tiene plan: sin plan no hay de
 * dónde sacar el período ni el monto, y el backend responde 400.
 */
export const createInvoiceSchema = z.object({
  issuedAt: isoDate.optional(),
  /** Por defecto `issuedAt + 5 días` (§6.5). */
  dueAt: isoDate.optional(),
  periodFrom: isoDate.optional(),
  periodTo: isoDate.optional(),
  items: z.array(invoiceItemSchema).max(20).optional(),
  /** Emitirla ya `SENT` en vez de `DRAFT` (el operador la manda por WhatsApp al vuelo). */
  send: z.coerce.boolean().optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

/** `POST /admin/invoices/:id/status` — transiciones manuales (enviar / anular). */
export const invoiceActionSchema = z.object({
  action: z.enum(["send", "void"]),
  reason: z.string().trim().max(200).optional().or(z.literal("")),
});

export type InvoiceActionInput = z.infer<typeof invoiceActionSchema>;

/**
 * `POST /admin/businesses/:id/payments` — registra un pago recibido (§6.4).
 * Salda las cuentas indicadas, extiende `validUntil` y reactiva el negocio si
 * estaba en mora.
 */
export const registerPaymentSchema = z.object({
  paidAt: isoDate,
  amount: z.coerce.number().min(1).max(99_999_999),
  method: z.string().trim().min(2).max(40),
  reference: z.string().trim().max(80).optional().or(z.literal("")),
  invoiceIds: z.array(z.string().uuid()).max(24).default([]),
  /**
   * Días con los que se extiende `validUntil`. Por defecto, el ciclo del plan
   * (30 / 365). Un pago de dos meses se registra con `extendDays: 60`.
   */
  extendDays: z.coerce.number().int().min(0).max(730).optional(),
});

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

/** Filtros de `GET /admin/invoices` (además de la paginación estándar). */
export const invoiceListQuerySchema = z.object({
  status: z.enum(invoiceStatusValues).optional(),
  businessId: z.string().uuid().optional(),
  /** `true` → solo lo pendiente de cobro (`SENT` + `OVERDUE`). */
  outstanding: z.coerce.boolean().optional(),
});

export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

/** Resultado de una corrida del ciclo de facturación (§6.4). */
export interface BillingRunResult {
  /** Fecha lógica de la corrida (`YYYY-MM-DD`, zona del operador). */
  runDate: string;
  invoicesCreated: number;
  invoicesOverdue: number;
  businessesPastDue: number;
  businessesSuspended: number;
  /** Detalle legible para el log y el panel. */
  notes: string[];
}
