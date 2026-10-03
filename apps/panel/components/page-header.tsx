import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * Encabezado de página al estilo Able Pro: migas arriba, título grande y, a la
 * derecha, las acciones principales de la vista.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs = [],
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Sin el último nivel: el título ya lo nombra. */
  breadcrumbs?: Array<{ href: string; label: string }>;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <Breadcrumbs items={breadcrumbs} />
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ href: string; label: string }> }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Migas" className="mb-1 flex flex-wrap items-center gap-1 text-xs text-[var(--color-fg-muted)]">
      {items.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <Link href={crumb.href} className="hover:text-[var(--color-primary)]">
            {crumb.label}
          </Link>
          <ChevronRight className="size-3" />
        </span>
      ))}
    </nav>
  );
}
