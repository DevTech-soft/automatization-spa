import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText } from "lucide-react";
import type { OperatorInvoiceDetail } from "@spa/shared";
import { InvoiceStatusBadge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { adminGet, ApiError } from "@/lib/backend";
import { formatDate, formatMoney } from "@/lib/format";
import { InvoiceActions } from "./invoice-actions";

/** Detalle de una cuenta de cobro: sus líneas, su estado y sus acciones (§6.5). */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let invoice: OperatorInvoiceDetail;
  try {
    invoice = await adminGet<OperatorInvoiceDetail>(`/admin/invoices/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href="/billing"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ChevronLeft className="size-4" />
        Cartera
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold">{invoice.number}</h1>
          <InvoiceStatusBadge status={invoice.status} />
        </div>
        {invoice.pdfUrl ? (
          <a
            href={invoice.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-primary)] hover:underline"
          >
            <FileText className="size-4" />
            Ver PDF
          </a>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-[var(--color-fg-muted)]">Cliente</dt>
          <dd>
            <Link href={`/businesses/${invoice.businessId}`} className="font-medium hover:underline">
              {invoice.businessName}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-fg-muted)]">Emitida</dt>
          <dd>{formatDate(invoice.issuedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-fg-muted)]">Vence</dt>
          <dd>
            {formatDate(invoice.dueAt)}
            {invoice.daysOverdue > 0 ? (
              <span className="block text-xs text-[var(--color-danger)]">
                {invoice.daysOverdue} día(s) de atraso
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-fg-muted)]">Período</dt>
          <dd>
            {formatDate(invoice.periodFrom)} – {formatDate(invoice.periodTo)}
          </dd>
        </div>
      </dl>

      <Table>
        <THead>
          <tr>
            <TH>Concepto</TH>
            <TH>Período</TH>
            <TH className="text-right">Valor</TH>
          </tr>
        </THead>
        <tbody>
          {invoice.items.map((item, index) => (
            <TR key={`${item.concept}-${index}`}>
              <TD>{item.concept}</TD>
              <TD className="text-[var(--color-fg-muted)]">{item.period || "—"}</TD>
              <TD className="text-right tabular-nums">{formatMoney(item.amount, invoice.currency)}</TD>
            </TR>
          ))}
          <tr className="border-t-2 border-[var(--color-border)]">
            <TD colSpan={2} className="font-medium">
              Total a pagar
            </TD>
            <TD className="text-right text-base font-semibold tabular-nums">
              {formatMoney(invoice.total, invoice.currency)}
            </TD>
          </tr>
        </tbody>
      </Table>

      {invoice.payments.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-[var(--color-fg-muted)]">Pagos aplicados</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {invoice.payments.map((payment) => (
              <li key={payment.id} className="flex justify-between rounded-[var(--radius)] border border-[var(--color-border)] px-3 py-2">
                <span>
                  {formatDate(payment.paidAt)} · {payment.method}
                </span>
                <span className="tabular-nums">{formatMoney(payment.amount, payment.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <InvoiceActions invoice={invoice} />
    </div>
  );
}
