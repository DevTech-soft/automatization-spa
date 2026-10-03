import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tarjeta de indicador (KPI) al estilo Able Pro: ícono en un recuadro tenue,
 * etiqueta, número grande y, cuando aporta, la variación contra el periodo
 * anterior o una línea de contexto.
 *
 * `tone` colorea el ícono y el número cuando el valor es un estado (vencido,
 * en mora). La variación se pinta por dirección × si subir es bueno, siempre con
 * flecha y signo: nunca solo color.
 */

const TONE = {
  default: { chip: "bg-[var(--color-primary-soft)] text-[var(--color-primary)]", value: "" },
  success: { chip: "bg-[var(--color-success-soft)] text-[var(--color-success)]", value: "text-[var(--color-success)]" },
  warning: { chip: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]", value: "text-[var(--color-warning)]" },
  danger: { chip: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]", value: "text-[var(--color-danger)]" },
} as const;

export function Stat({
  label,
  value,
  hint,
  icon,
  delta,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Ícono de lucide ya instanciado (`<Wallet />`). */
  icon?: React.ReactNode;
  /** Variación en % contra el periodo anterior. `null` = sin base para comparar. */
  delta?: { percent: number | null; label: string; upIsGood?: boolean };
  tone?: keyof typeof TONE;
  className?: string;
}) {
  const good = delta?.percent != null && (delta.percent >= 0) === (delta.upIsGood ?? true);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] p-5 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {icon ? (
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg [&>svg]:size-5",
              TONE[tone].chip,
            )}
          >
            {icon}
          </span>
        ) : null}
        <span className="text-sm text-[var(--color-fg-muted)]">{label}</span>
      </div>
      <span className={cn("text-2xl font-semibold tracking-tight", TONE[tone].value)}>{value}</span>
      {delta || hint ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-fg-muted)]">
          {delta && delta.percent != null ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium",
                good
                  ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                  : "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
              )}
            >
              {delta.percent >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {delta.percent >= 0 ? "+" : ""}
              {delta.percent}%
            </span>
          ) : null}
          {delta ? <span>{delta.label}</span> : null}
          {hint ? <span>{hint}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
