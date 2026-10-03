import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tabla del panel. Server-component puro: la paginación, el orden y los filtros
 * los resuelve el backend (docs/PANEL-OPERADOR.md §D10), así que aquí no hace
 * falta el estado de TanStack Table — solo el marco visual compartido.
 */

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] shadow-[var(--shadow-card)]">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-[var(--color-border)] bg-[var(--color-surface)]/60 text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]",
        className,
      )}
      {...props}
    />
  );
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-4 py-3 font-semibold", className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface)]",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-top", className)} {...props} />;
}

/** Fila única que ocupa toda la tabla cuando no hay datos. */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-[var(--color-fg-muted)]">
        {children}
      </td>
    </tr>
  );
}
