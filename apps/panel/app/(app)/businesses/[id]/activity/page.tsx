import Link from "next/link";
import { CalendarCheck, Gift, MessagesSquare, Search, Wallet } from "lucide-react";
import type {
  AppointmentRow,
  BusinessDetail,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminGet } from "@/lib/backend";
import { todayIn } from "@/lib/format";
import { appointmentActionAdmin } from "../../actions";
import { cn } from "@/lib/utils";

/**
 * Actividad operativa de un cliente: sus citas, los pagos que recibió, las
 * conversaciones del bot y sus gift cards. Hoy es la vista de soporte del
 * operador; en F7 es la misma data que verá el dueño del spa en su portal
 * (docs/PANEL-OPERADOR.md §8.5).
 */

const VIEWS = [
  { key: "appointments", label: "Citas", icon: CalendarCheck },
  { key: "payments", label: "Pagos", icon: Wallet },
  { key: "conversations", label: "Conversaciones", icon: MessagesSquare },
  { key: "gift-cards", label: "Gift cards", icon: Gift },
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Vista"
          className="inline-flex flex-wrap rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-1 shadow-[var(--shadow-card)]"
        >
          {VIEWS.map((item) => (
            <Link
              key={item.key}
              href={`${basePath}?view=${item.key}`}
              aria-current={item.key === view ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                item.key === view
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                  : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <form className="flex w-full gap-2 sm:w-auto" action={basePath}>
          <input type="hidden" name="view" value={view} />
          <div className="relative flex-1 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-fg-muted)]" />
            <Input name="q" defaultValue={q} placeholder="Buscar…" aria-label="Buscar" className="pl-9" />
          </div>
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>
      </div>

      {view === "appointments" ? (
        <AppointmentsTable
          data={await adminGet<PaginatedResponse<AppointmentRow>>(
            `/admin/businesses/${id}/${endpoint}?${query}`,
          )}
          basePath={basePath}
          params={linkParams}
          actions={{
            today: todayIn((await adminGet<BusinessDetail>(`/admin/businesses/${id}`)).timezone),
            run: appointmentActionAdmin.bind(null, id),
          }}
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
