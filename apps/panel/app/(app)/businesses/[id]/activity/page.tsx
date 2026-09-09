import Link from "next/link";
import type {
  AppointmentRow,
  ConversationRow,
  GiftCardRow,
  PaginatedResponse,
  PaymentRow,
} from "@spa/shared";
import { StateBadge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR, EmptyRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { adminGet } from "@/lib/backend";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
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

interface TableProps<T> {
  data: PaginatedResponse<T>;
  basePath: string;
  params: Record<string, string | undefined>;
}

function AppointmentsTable({ data, basePath, params }: TableProps<AppointmentRow>) {
  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH>Fecha</TH>
            <TH>Clienta</TH>
            <TH>Servicio</TH>
            <TH>Origen</TH>
            <TH>Estado</TH>
            <TH className="text-right">Valor</TH>
          </tr>
        </THead>
        <tbody>
          {data.items.length === 0 ? (
            <EmptyRow colSpan={6}>Sin citas en este negocio.</EmptyRow>
          ) : (
            data.items.map((row) => (
              <TR key={row.id}>
                <TD>
                  <span className="block">{formatDate(row.date)}</span>
                  <span className="text-xs text-[var(--color-fg-muted)]">
                    {row.startTime}–{row.endTime}
                  </span>
                </TD>
                <TD>
                  <span className="block">{row.customerName}</span>
                  <span className="font-mono text-xs text-[var(--color-fg-muted)]">
                    {row.customerPhone ?? "—"}
                  </span>
                </TD>
                <TD>{row.serviceName}</TD>
                <TD>
                  <StateBadge value={row.source} />
                </TD>
                <TD className="space-y-1">
                  <StateBadge value={row.status} />
                  <div>
                    <StateBadge value={row.paymentStatus} />
                  </div>
                </TD>
                <TD className="text-right tabular-nums">
                  <span className="block">{formatMoney(row.price)}</span>
                  {row.depositAmount != null ? (
                    <span className="text-xs text-[var(--color-fg-muted)]">
                      abono {formatMoney(row.depositAmount)} · saldo{" "}
                      {formatMoney(row.pendingBalance ?? 0)}
                    </span>
                  ) : null}
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
      <Pagination data={data} basePath={basePath} params={params} />
    </>
  );
}

function PaymentsTable({ data, basePath, params }: TableProps<PaymentRow>) {
  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH>Referencia</TH>
            <TH>Concepto</TH>
            <TH>Estado</TH>
            <TH>Actualizado</TH>
            <TH className="text-right">Monto</TH>
          </tr>
        </THead>
        <tbody>
          {data.items.length === 0 ? (
            <EmptyRow colSpan={5}>Sin pagos registrados.</EmptyRow>
          ) : (
            data.items.map((row) => (
              <TR key={row.id}>
                <TD className="font-mono text-xs">{row.reference}</TD>
                <TD>
                  <StateBadge value={row.entityType} />
                </TD>
                <TD>
                  <StateBadge value={row.status} />
                </TD>
                <TD className="text-[var(--color-fg-muted)]">{formatDateTime(row.updatedAt)}</TD>
                <TD className="text-right tabular-nums">{formatMoney(row.amount, row.currency)}</TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
      <Pagination data={data} basePath={basePath} params={params} />
    </>
  );
}

function ConversationsTable({ data, basePath, params }: TableProps<ConversationRow>) {
  return (
    <>
      <p className="text-sm text-[var(--color-fg-muted)]">
        En qué punto quedó cada conversación del bot. No hay transcripción: la tabla guarda el
        estado de la máquina de conversación, no los mensajes.
      </p>
      <Table>
        <THead>
          <tr>
            <TH>Teléfono</TH>
            <TH>Clienta</TH>
            <TH>Estado</TH>
            <TH>Eligió</TH>
            <TH>Último turno</TH>
          </tr>
        </THead>
        <tbody>
          {data.items.length === 0 ? (
            <EmptyRow colSpan={5}>Sin conversaciones registradas.</EmptyRow>
          ) : (
            data.items.map((row) => (
              <TR key={row.id}>
                <TD className="font-mono text-xs">{row.phone}</TD>
                <TD>{row.customerName ?? "—"}</TD>
                <TD>
                  <StateBadge value={row.state} />
                </TD>
                <TD className="text-[var(--color-fg-muted)]">
                  {row.serviceName ?? "—"}
                  {row.date ? (
                    <span className="block text-xs">
                      {formatDate(row.date)} {row.startTime ?? ""}
                    </span>
                  ) : null}
                </TD>
                <TD className="text-[var(--color-fg-muted)]">{formatDateTime(row.updatedAt)}</TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
      <Pagination data={data} basePath={basePath} params={params} />
    </>
  );
}

function GiftCardsTable({ data, basePath, params }: TableProps<GiftCardRow>) {
  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH>Código</TH>
            <TH>Compró</TH>
            <TH>Para</TH>
            <TH>Estado</TH>
            <TH className="text-right">Valor</TH>
          </tr>
        </THead>
        <tbody>
          {data.items.length === 0 ? (
            <EmptyRow colSpan={5}>Sin gift cards.</EmptyRow>
          ) : (
            data.items.map((row) => (
              <TR key={row.id}>
                <TD className="font-mono text-xs">{row.code}</TD>
                <TD>{row.buyerName}</TD>
                <TD>{row.recipientName}</TD>
                <TD className="space-y-1">
                  <StateBadge value={row.status} />
                  {row.redeemedAt ? (
                    <span className="block text-xs text-[var(--color-fg-muted)]">
                      redimida {formatDateTime(row.redeemedAt)}
                    </span>
                  ) : null}
                </TD>
                <TD className="text-right tabular-nums">{formatMoney(row.amount)}</TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
      <Pagination data={data} basePath={basePath} params={params} />
    </>
  );
}
