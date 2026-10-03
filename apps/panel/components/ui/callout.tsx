import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Aviso dentro de una pestaña (sin plan, sin número conectado, llaves
 * globales…). El ícono acompaña al color para que el tono no dependa solo de él.
 */
const TONES = {
  info: { box: "bg-[var(--color-primary-soft)] text-[var(--color-primary)]", Icon: Info },
  success: { box: "bg-[var(--color-success-soft)] text-[var(--color-success)]", Icon: CheckCircle2 },
  warning: { box: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]", Icon: AlertTriangle },
  danger: { box: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]", Icon: XCircle },
} as const;

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const { box, Icon } = TONES[tone];
  return (
    <div className={cn("flex gap-3 rounded-lg px-4 py-3 text-sm", box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-col gap-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && "opacity-90")}>{children}</div> : null}
      </div>
    </div>
  );
}
