import Link from "next/link";
import type { OperatorInvoiceListItem, OperatorPaymentListItem, PaginatedResponse } from "@spa/shared";
import { invoiceStatusValues, INVOICE_STATUS_LABEL } from "@spa/shared";
import { InvoiceStatusBadge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR, EmptyRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { adminGet } from "@/lib/backend";
import { formatDate, formatMoney } from "@/lib/format";
import { RunCycleButton } from "./run-cycle-button";
import { PageHeader } from "@/components/page-header";

/**
 * Cartera del operador: qué emitió, qué le deben y qué ya cobró
 * (docs/PANEL-OPERADOR.md §6.4/§6.5).
 */

type SearchParams = Promise<{ page?: string; status?: string; q?: string }>;

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const status = invoiceStatusValues.includes(sp.status as never) ? sp.status : undefined;
  const q = (sp.q ?? "").trim();

  const query = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (status) query.set("status", status);
  if (q) query.set("q", q);

  const [invoices, payments] = await Promise.all([
    adminGet<PaginatedResponse<OperatorInvoiceListItem>>(`/admin/invoices?${query}`),
    adminGet<PaginatedResponse<OperatorPaymentListItem>>("/admin/payments?page=1&pageSize=8"),
  ]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title="Cartera"
        description="Cuentas de cobro emitidas a tus clientes y pagos recibidos."
        actions={<RunCycleButton />}
      />

      <section className="flex flex-col gap-3">
        <form className="flex flex-wrap gap-2" action="/billing">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por número o cliente…"
            className="h-9 w-full max-w-xs rounded-[var(--radius)] border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm outline-none focus-visible:border-[var(--color-ring)]"
          />
          <select
            name="status"
            defaultValue={status ?? ""}
            className="h-9 rounded-[var(--radius)] border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm outline-none"
          >
            <option value="">Todos los estados</option>
            {invoiceStatusValues.map((value) => (
              <option key={value} value={value}>
                {INVOICE_STATUS_LABEL[value]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-9 rounded-[var(--radius)] border border-[var(--color-border)] px-3 text-sm hover:bg-[var(--color-surface)]"
          >
            Filtrar
          </button>
        </form>

        <Table>
          <THead>
            <tr>
              <TH>Número</TH>
              <TH>Cliente</TH>
              <TH>Emitida</TH>
              <TH>Vence</TH>
              <TH>Estado</TH>
              <TH className="text-right">Total</TH>
            </tr>
          </THead>
          <tbody>
            {invoices.items.length === 0 ? (
              <EmptyRow colSpan={6}>
                {status || q
                  ? "Sin resultados con esos filtros."
                  : "Todavía no has emitido ninguna cuenta de cobro."}
              </EmptyRow>
            ) : (
              invoices.items.map((invoice) => (
                <TR key={invoice.id}>
                  <TD>
                    <Link href={`/billing/${invoice.id}`} className="font-mono text-xs hover:underline">
                      {invoice.number}
                    </Link>
                  </TD>
                  <TD>
                    <Link href={`/businesses/${invoice.businessId}`} className="hover:underline">
                      {invoice.businessName}
                    </Link>
                  </TD>
                  <TD className="text-[var(--color-fg-muted)]">{formatDate(invoice.issuedAt)}</TD>
                  <TD>
                    <span className="block">{formatDate(invoice.dueAt)}</span>
                    {invoice.daysOverdue > 0 ? (
                      <span className="text-xs text-[var(--color-danger)]">
                        {invoice.daysOverdue} día(s) de atraso
                      </span>
                    ) : null}
                  </TD>
                  <TD>
                    <InvoiceStatusBadge status={invoice.status} />
                  </TD>
                  <TD className="text-right tabular-nums">
                    {formatMoney(invoice.total, invoice.currency)}
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>

        <Pagination data={invoices} basePath="/billing" params={{ status, q }} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-[var(--color-fg-muted)]">Últimos pagos recibidos</h2>
        <Table>
          <THead>
            <tr>
              <TH>Fecha</TH>
              <TH>Cliente</TH>
              <TH>Método</TH>
              <TH>Salda</TH>
              <TH className="text-right">Monto</TH>
            </tr>
          </THead>
          <tbody>
            {payments.items.length === 0 ? (
              <EmptyRow colSpan={5}>Todavía no has registrado pagos.</EmptyRow>
            ) : (
              payments.items.map((payment) => (
                <TR key={payment.id}>
                  <TD>{formatDate(payment.paidAt)}</TD>
                  <TD>
                    <Link href={`/businesses/${payment.businessId}`} className="hover:underline">
                      {payment.businessName}
                    </Link>
                  </TD>
                  <TD>
                    {payment.method}
                    {payment.reference ? (
                      <span className="block text-xs text-[var(--color-fg-muted)]">
                        Ref. {payment.reference}
                      </span>
                    ) : null}
                  </TD>
                  <TD className="font-mono text-xs text-[var(--color-fg-muted)]">
                    {payment.invoiceNumbers.length > 0 ? payment.invoiceNumbers.join(", ") : "—"}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {formatMoney(payment.amount, payment.currency)}
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
