import { cn } from "@/lib/utils";
import type { BusinessStatus } from "@spa/shared";

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
