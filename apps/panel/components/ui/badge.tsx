import { cn } from "@/lib/utils";
import type { BusinessStatus, OperatorInvoiceStatus } from "@spa/shared";
import { INVOICE_STATUS_LABEL } from "@spa/shared";

const STATUS_STYLES: Record<BusinessStatus, string> = {
  TRIAL: "bg-blue-50 text-blue-700 border-blue-200",
  ACTIVE: "bg-green-50 text-green-700 border-green-200",
  PAST_DUE: "bg-amber-50 text-amber-800 border-amber-200",
  SUSPENDED: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-zinc-100 text-zinc-600 border-zinc-200",
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
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const INVOICE_STYLES: Record<OperatorInvoiceStatus, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600 border-zinc-200",
  SENT: "bg-blue-50 text-blue-700 border-blue-200",
  PAID: "bg-green-50 text-green-700 border-green-200",
  OVERDUE: "bg-red-50 text-red-700 border-red-200",
  VOID: "bg-zinc-100 text-zinc-500 border-zinc-200 line-through",
};

export function InvoiceStatusBadge({ status }: { status: OperatorInvoiceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
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
  neutral: "bg-zinc-100 text-zinc-600 border-zinc-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  success: "bg-green-50 text-green-700 border-green-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
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
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        TONE_STYLES[STATE_TONES[value] ?? "neutral"],
      )}
    >
      {stateLabel(value)}
    </span>
  );
}
