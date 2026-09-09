import Link from "next/link";
import type { PaginatedResponse } from "@spa/shared";

/**
 * Paginador de los listados. Navega por URL (no por estado de cliente) para que
 * cada página sea enlazable y el server component la resuelva sin hidratación.
 */
export function Pagination<T>({
  data,
  basePath,
  params = {},
}: {
  data: PaginatedResponse<T>;
  basePath: string;
  /** Filtros vigentes que deben sobrevivir al cambio de página. */
  params?: Record<string, string | undefined>;
}) {
  if (data.totalPages <= 1) {
    return null;
  }

  const href = (page: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    search.set("page", String(page));
    return `${basePath}?${search}`;
  };

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--color-fg-muted)]">
        Página {data.page} de {data.totalPages} · {data.total} en total
      </span>
      <div className="flex gap-2">
        <PageLink href={href(data.page - 1)} disabled={data.page <= 1}>
          Anterior
        </PageLink>
        <PageLink href={href(data.page + 1)} disabled={data.page >= data.totalPages}>
          Siguiente
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-[var(--radius)] border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-fg-muted)] opacity-50">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-[var(--radius)] border border-[var(--color-border)] px-3 py-1.5 hover:bg-[var(--color-surface)]"
    >
      {children}
    </Link>
  );
}
