import { cn } from "@/lib/utils";

/**
 * Barras horizontales de magnitud por categoría (canales de reserva, servicios,
 * clientes por estado). Una sola tinta: el color no codifica la categoría, la
 * etiqueta sí. El valor va al final de la barra, en tinta de texto.
 */
export function BarList({
  items,
  emptyText = "Sin datos en el rango.",
}: {
  items: Array<{ key: string; label: React.ReactNode; value: number; display: string }>;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--color-fg-muted)]">{emptyText}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{item.display}</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--color-primary-soft)]" aria-hidden>
            <div
              className={cn("h-2 rounded-full bg-[var(--color-primary)]")}
              style={{ width: `${(item.value / max) * 100}%`, minWidth: item.value > 0 ? 4 : 0 }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
