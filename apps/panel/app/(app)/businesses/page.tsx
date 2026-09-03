import Link from "next/link";
import { Plus } from "lucide-react";
import type { BusinessListItem, PaginatedResponse } from "@spa/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { adminGet } from "@/lib/backend";
import { cn } from "@/lib/utils";

const CHARGE_LABEL = { TOTAL: "Total", DEPOSIT: "Abono" } as const;

type SearchParams = Promise<{ page?: string; q?: string }>;

export default async function BusinessesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const q = (sp.q ?? "").trim();

  const query = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (q) query.set("q", q);

  const data = await adminGet<PaginatedResponse<BusinessListItem>>(`/admin/businesses?${query}`);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Negocios</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">{data.total} en total</p>
        </div>
        <Link href="/businesses/new" className={cn(buttonVariants({ size: "md" }))}>
          <Plus className="size-4" />
          Nuevo negocio
        </Link>
      </div>

      <form className="flex gap-2" action="/businesses">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre o slug…"
          className="h-9 w-full max-w-sm rounded-[var(--radius)] border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm outline-none focus-visible:border-[var(--color-ring)]"
        />
        <Button type="submit" variant="outline" size="sm">
          Buscar
        </Button>
      </form>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)] text-left text-[var(--color-fg-muted)]">
            <tr>
              <th className="px-4 py-2.5 font-medium">Nombre</th>
              <th className="px-4 py-2.5 font-medium">Slug</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="px-4 py-2.5 font-medium">Cobro</th>
              <th className="px-4 py-2.5 font-medium">Creado</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--color-fg-muted)]">
                  {q ? "Sin resultados." : "Todavía no hay negocios."}
                </td>
              </tr>
            ) : (
              data.items.map((b) => (
                <tr key={b.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface)]">
                  <td className="px-4 py-2.5">
                    <Link href={`/businesses/${b.id}`} className="font-medium hover:underline">
                      {b.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-fg-muted)]">{b.slug}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={b.status} />
                    {!b.active ? <span className="ml-2 text-xs text-[var(--color-fg-muted)]">(inactivo)</span> : null}
                  </td>
                  <td className="px-4 py-2.5">{CHARGE_LABEL[b.chargeMode]}</td>
                  <td className="px-4 py-2.5 text-[var(--color-fg-muted)]">
                    {new Date(b.createdAt).toLocaleDateString("es-CO")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--color-fg-muted)]">
            Página {data.page} de {data.totalPages}
          </span>
          <div className="flex gap-2">
            <PageLink page={page - 1} q={q} disabled={page <= 1}>
              Anterior
            </PageLink>
            <PageLink page={page + 1} q={q} disabled={page >= data.totalPages}>
              Siguiente
            </PageLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PageLink({
  page,
  q,
  disabled,
  children,
}: {
  page: number;
  q: string;
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
  const params = new URLSearchParams({ page: String(page) });
  if (q) params.set("q", q);
  return (
    <Link
      href={`/businesses?${params}`}
      className="rounded-[var(--radius)] border border-[var(--color-border)] px-3 py-1.5 hover:bg-[var(--color-surface)]"
    >
      {children}
    </Link>
  );
}
