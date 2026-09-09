import { z } from "zod";
import type { BusinessStatus } from "./business.js";

/**
 * Métricas del panel (docs/PANEL-OPERADOR.md §1: "dashboard de cartera /
 * vencimientos" y "métricas de ingresos del operador", F3e/F6).
 *
 * Dos niveles distintos, con dos monedas conceptuales que **no se suman**:
 * - Negocio del operador: lo que sus clientes le pagan a él (`SubscriptionPlan`,
 *   `OperatorInvoice`, `OperatorPayment`).
 * - Consumo de cada cliente: lo que pasa dentro del spa (citas, conversaciones,
 *   gift cards, volumen transaccionado en Wompi) — es el uso que justifica la
 *   mensualidad, no ingreso del operador.
 */

/** Cartera + estado del negocio del operador. `GET /admin/metrics/overview`. */
export interface OperatorOverview {
  generatedAt: string;
  currency: string;
  clients: {
    total: number;
    byStatus: Record<BusinessStatus, number>;
    /** Negocios que facturan hoy (`ACTIVE` + `PAST_DUE`): el denominador real del MRR. */
    billable: number;
    newThisMonth: number;
  };
  revenue: {
    /** Ingreso recurrente mensual comprometido (planes de negocios facturables). */
    mrr: number;
    collectedThisMonth: number;
    collectedLastMonth: number;
    /** Emitido y sin pagar (`SENT` + `OVERDUE`). */
    outstanding: number;
    /** Del `outstanding`, lo que ya pasó de `dueAt`. */
    overdue: number;
  };
  invoices: {
    draft: number;
    sent: number;
    overdue: number;
    paidThisMonth: number;
  };
  /** Próximos vencimientos de plan, del más urgente al menos (incluye los ya vencidos). */
  renewals: RenewalRow[];
  /** Consumo agregado de todos los clientes en la ventana (por defecto 30 días). */
  usage: {
    rangeDays: number;
    appointments: number;
    conversations: number;
    giftCards: number;
    /** Volumen transaccionado por los clientes en Wompi (no es ingreso del operador). */
    grossVolume: number;
  };
}

export interface RenewalRow {
  businessId: string;
  businessName: string;
  status: BusinessStatus;
  /** `YYYY-MM-DD`. */
  validUntil: string;
  daysRemaining: number;
  graceDays: number;
  price: number;
  currency: string;
  /** Cuentas de cobro emitidas y sin pagar de ese negocio. */
  outstanding: number;
}

/** Consumo de un cliente. `GET /admin/businesses/:id/usage?days=30`. */
export interface BusinessUsage {
  businessId: string;
  rangeDays: number;
  from: string;
  to: string;
  currency: string;
  appointments: {
    total: number;
    confirmed: number;
    pending: number;
    cancelled: number;
    completed: number;
    noShow: number;
    /** Cuántas entraron por WhatsApp vs. formulario web. */
    bySource: Record<string, number>;
  };
  revenue: {
    /** Suma de pagos aprobados en la ventana (lo que el spa recibió por Wompi). */
    grossVolume: number;
    /** Parte cobrada como abono (modo `DEPOSIT`). */
    deposits: number;
    paidCount: number;
  };
  conversations: {
    /** Conversaciones de WhatsApp con actividad en la ventana. */
    active: number;
    total: number;
    lastMessageAt: string | null;
  };
  giftCards: {
    sold: number;
    redeemed: number;
    amount: number;
  };
  /** Serie diaria para las gráficas del panel. */
  series: UsagePoint[];
  topServices: TopService[];
}

export interface UsagePoint {
  /** `YYYY-MM-DD`. */
  date: string;
  appointments: number;
  revenue: number;
}

export interface TopService {
  serviceId: string;
  name: string;
  appointments: number;
  revenue: number;
}

/** Ventana de las métricas de consumo. */
export const usageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type UsageQuery = z.infer<typeof usageQuerySchema>;
