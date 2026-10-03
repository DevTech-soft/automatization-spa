import Link from "next/link";
import type {
  AppointmentRow,
  ConversationRow,
  GiftCardRow,
  PaginatedResponse,
  PaymentRow,
} from "@spa/shared";
import {
  AppointmentsTable,
  ConversationsTable,
  GiftCardsTable,
  PaymentsTable,
} from "@/components/activity-tables";
import { adminGet } from "@/lib/backend";
import { cn } from "@/lib/utils";

/**
 * Actividad operativa de un cliente: sus citas, los pagos que recibió, las
 * conversaciones del bot y sus gift cards. Hoy es la vista de soporte del
 * operador; en F7 es la misma data que verá el dueño del spa en su portal
 * (docs/PANEL-OPERADOR.md §8.5).
 */

const VIEWS = [
  { key: "appointments", label: "Citas" },
  { key: "payments", label: "Pagos" },
  { key: "conversations", label: "Conversaciones" },
  { key: "gift-cards", label: "Gift cards" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

type SearchParams = Promise<{ view?: string; page?: string; q?: string }>;

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const view = (VIEWS.find((v) => v.key === sp.view)?.key ?? "appointments") as ViewKey;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const q = (sp.q ?? "").trim();

  const query = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (q) query.set("q", q);

  // El endpoint de pagos se llama `transactions` para no chocar con
  // `/admin/payments`, que son los pagos que el operador recibe de sus clientes.
  const endpoint = view === "payments" ? "transactions" : view;
  const basePath = `/businesses/${id}/activity`;
  const linkParams = { view, q: q || undefined };

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-2">
        {VIEWS.map((item) => (
          <Link
            key={item.key}
            href={`${basePath}?view=${item.key}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              item.key === view
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                : "border-[var(--color-border)] hover:bg-[var(--color-surface)]",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <form className="flex gap-2" action={basePath}>
        <input type="hidden" name="view" value={view} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar…"
          className="h-9 w-full max-w-xs rounded-[var(--radius)] border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm outline-none focus-visible:border-[var(--color-ring)]"
        />
        <button
          type="submit"
          className="h-9 rounded-[var(--radius)] border border-[var(--color-border)] px-3 text-sm hover:bg-[var(--color-surface)]"
        >
          Buscar
        </button>
      </form>

      {view === "appointments" ? (
        <AppointmentsTable
          data={await adminGet<PaginatedResponse<AppointmentRow>>(
            `/admin/businesses/${id}/${endpoint}?${query}`,
          )}
          basePath={basePath}
          params={linkParams}
        />
      ) : view === "payments" ? (
        <PaymentsTable
          data={await adminGet<PaginatedResponse<PaymentRow>>(
            `/admin/businesses/${id}/${endpoint}?${query}`,
          )}
          basePath={basePath}
          params={linkParams}
        />
      ) : view === "conversations" ? (
        <ConversationsTable
          data={await adminGet<PaginatedResponse<ConversationRow>>(
            `/admin/businesses/${id}/${endpoint}?${query}`,
          )}
          basePath={basePath}
          params={linkParams}
        />
      ) : (
        <GiftCardsTable
          data={await adminGet<PaginatedResponse<GiftCardRow>>(
            `/admin/businesses/${id}/${endpoint}?${query}`,
          )}
          basePath={basePath}
          params={linkParams}
        />
      )}
    </div>
  );
}
