import { cn } from "@/lib/utils";
import type { BusinessStatus, OperatorInvoiceStatus } from "@spa/shared";
import { INVOICE_STATUS_LABEL } from "@spa/shared";

const STATUS_STYLES: Record<BusinessStatus, string> = {
  TRIAL: "bg-[var(--color-primary-soft)] text-[var(--color-primary)]",
  ACTIVE: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  PAST_DUE: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  SUSPENDED: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  CANCELLED: "bg-[var(--color-grid)] text-[var(--color-fg-muted)]",
};

const STATUS_LABEL: Record<BusinessStatus, string> = {
  TRIAL: "Prueba",
  ACTIVE: "Activo",
  PAST_DUE: "En mora",
  SUSPENDED: "Suspendido",
  CANCELLED: "Cancelado",
};

export function StatusBadge({ status }: { status: BusinessStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const INVOICE_STYLES: Record<OperatorInvoiceStatus, string> = {
  DRAFT: "bg-[var(--color-grid)] text-[var(--color-fg-muted)]",
  SENT: "bg-[var(--color-primary-soft)] text-[var(--color-primary)]",
  PAID: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  OVERDUE: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  VOID: "bg-[var(--color-grid)] text-[var(--color-fg-muted)] line-through",
};

export function InvoiceStatusBadge({ status }: { status: OperatorInvoiceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        INVOICE_STYLES[status],
      )}
    >
      {INVOICE_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Etiqueta genérica para los estados que vienen del runtime del negocio
 * (citas, pagos, conversaciones): son enums de Prisma, no un conjunto cerrado
 * que valga la pena tipar en el panel, así que se pintan neutros con un color
 * por familia semántica.
 */
const TONE_STYLES = {
  neutral: "bg-[var(--color-grid)] text-[var(--color-fg-muted)]",
  info: "bg-[var(--color-primary-soft)] text-[var(--color-primary)]",
  success: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
} as const;

export type BadgeTone = keyof typeof TONE_STYLES;

const STATE_TONES: Record<string, BadgeTone> = {
  CONFIRMED: "success",
  COMPLETED: "success",
  PAID: "success",
  DEPOSIT_PAID: "info",
  REDEEMED: "success",
  SENT: "info",
  PENDING: "warning",
  WAITING_PAYMENT: "warning",
  CANCELLED: "danger",
  EXPIRED: "neutral",
  NO_SHOW: "danger",
  FAILED: "danger",
  REFUNDED: "neutral",
};

const STATE_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No asistió",
  EXPIRED: "Expirada",
  PAID: "Pagado",
  DEPOSIT_PAID: "Abono pagado",
  FAILED: "Fallido",
  REFUNDED: "Reembolsado",
  SENT: "Enviada",
  REDEEMED: "Redimida",
  WEB: "Web",
  WHATSAPP: "WhatsApp",
  GIFT_CARD: "Gift card",
  SELECTING_SERVICE: "Eligiendo servicio",
  SELECTING_DATE: "Eligiendo fecha",
  SELECTING_TIME: "Eligiendo hora",
  COLLECTING_NAME: "Pidiendo nombre",
  COLLECTING_PHONE: "Pidiendo teléfono",
  WAITING_PAYMENT: "Esperando pago",
};

/** Nombre legible de un enum del runtime; devuelve el valor crudo si no lo conoce. */
export function stateLabel(value: string): string {
  return STATE_LABELS[value] ?? value;
}

export function StateBadge({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        TONE_STYLES[STATE_TONES[value] ?? "neutral"],
      )}
    >
      {stateLabel(value)}
    </span>
  );
}
