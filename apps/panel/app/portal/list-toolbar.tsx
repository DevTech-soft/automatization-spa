/**
 * Barra de búsqueda/filtros de los listados del portal. Es un `<form method=get>`
 * plano: los filtros viven en la URL, como el resto de listados del panel, para
 * que cada vista sea enlazable y la resuelva el server component.
 */
export function ListToolbar({
  action,
  q,
  placeholder = "Buscar…",
  dates,
  statuses,
  status,
}: {
  action: string;
  q: string;
  placeholder?: string;
  /** Muestra los filtros de rango `from`/`to` con estos valores. */
  dates?: { from: string; to: string };
  /** Opciones del filtro de estado: `[valor, etiqueta]`. */
  statuses?: Array<[string, string]>;
  status?: string;
}) {
  const inputClass =
    "h-9 rounded-[var(--radius)] border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm outline-none focus-visible:border-[var(--color-ring)]";

  return (
    <form className="flex flex-wrap items-end gap-2" action={action}>
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-[var(--color-fg-muted)] sm:max-w-xs">
        Buscar
        <input name="q" defaultValue={q} placeholder={placeholder} className={inputClass} />
      </label>
      {statuses ? (
        <label className="flex flex-col gap-1 text-xs text-[var(--color-fg-muted)]">
          Estado
          <select name="status" defaultValue={status ?? ""} className={inputClass}>
            <option value="">Todos</option>
            {statuses.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {dates ? (
        <>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-fg-muted)]">
            Desde
            <input type="date" name="from" defaultValue={dates.from} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-fg-muted)]">
            Hasta
            <input type="date" name="to" defaultValue={dates.to} className={inputClass} />
          </label>
        </>
      ) : null}
      <button
        type="submit"
        className="h-9 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm hover:bg-[var(--color-surface)]"
      >
        Filtrar
      </button>
    </form>
  );
}

/** Lee los filtros comunes de `searchParams` y arma la query para el backend. */
export function listQuery(
  sp: Record<string, string | undefined>,
  keys: string[] = [],
): { page: number; q: string; query: URLSearchParams; linkParams: Record<string, string | undefined> } {
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const q = (sp.q ?? "").trim();
  const query = new URLSearchParams({ page: String(page), pageSize: "20" });
  const linkParams: Record<string, string | undefined> = {};
  if (q) {
    query.set("q", q);
    linkParams.q = q;
  }
  for (const key of keys) {
    const value = (sp[key] ?? "").trim();
    if (value) {
      query.set(key, value);
      linkParams[key] = value;
    }
  }
  return { page, q, query, linkParams };
}
