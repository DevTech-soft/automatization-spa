import { cn } from "@/lib/utils";

/**
 * Tarjeta de indicador del dashboard. Un número grande, su etiqueta y, cuando
 * aporta, una línea de contexto (comparación con el mes anterior, desglose).
 */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning" | "danger" | "success";
  className?: string;
}) {
  const toneClass = {
    default: "",
    success: "text-green-600",
    warning: "text-amber-600",
    danger: "text-[var(--color-danger)]",
  }[tone];

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] p-4",
        className,
      )}
    >
      <span className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">{label}</span>
      <span className={cn("text-2xl font-semibold tabular-nums", toneClass)}>{value}</span>
      {hint ? <span className="text-xs text-[var(--color-fg-muted)]">{hint}</span> : null}
    </div>
  );
}
