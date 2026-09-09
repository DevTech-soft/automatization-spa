import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { OperatorOverview } from "@spa/shared";
import { businessStatusValues } from "@spa/shared";
import { Stat } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR, EmptyRow } from "@/components/ui/table";
import { adminGet } from "@/lib/backend";
import { formatDate, formatDaysRemaining, formatMoney, formatNumber, percentChange } from "@/lib/format";

/**
 * Inicio del panel: el estado del negocio del operador de un vistazo
 * (docs/PANEL-OPERADOR.md §1, F3e).
 *
 * Dos bloques que no se mezclan: arriba **su** cartera (MRR, cobrado,
 * pendiente); abajo el **consumo** de sus clientes, que es lo que justifica la
 * mensualidad pero cuya plata va directo a la cuenta de cada spa (D3).
 */
export default async function DashboardPage() {
  const overview = await adminGet<OperatorOverview>("/admin/metrics/overview");

  const growth = percentChange(overview.revenue.collectedThisMonth, overview.revenue.collectedLastMonth);
  const urgent = overview.renewals.filter((row) => row.daysRemaining <= 7 || row.outstanding > 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Inicio</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Cartera y uso de los últimos {overview.usage.rangeDays} días.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-[var(--color-fg-muted)]">Tu negocio</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Ingreso mensual"
            value={formatMoney(overview.revenue.mrr, overview.currency)}
            hint={`${overview.clients.billable} cliente(s) facturando`}
          />
          <Stat
            label="Cobrado este mes"
            value={formatMoney(overview.revenue.collectedThisMonth, overview.currency)}
            hint={
              growth === null
                ? `Mes anterior: ${formatMoney(overview.revenue.collectedLastMonth, overview.currency)}`
                : `${growth >= 0 ? "+" : ""}${growth}% vs. mes anterior`
            }
            tone={growth !== null && growth < 0 ? "warning" : "default"}
          />
          <Stat
            label="Por cobrar"
            value={formatMoney(overview.revenue.outstanding, overview.currency)}
            hint={`${overview.invoices.sent + overview.invoices.overdue} cuenta(s) emitida(s)`}
          />
          <Stat
            label="Vencido"
            value={formatMoney(overview.revenue.overdue, overview.currency)}
            hint={`${overview.invoices.overdue} cuenta(s) en mora`}
            tone={overview.revenue.overdue > 0 ? "danger" : "success"}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-[var(--color-fg-muted)]">Clientes</h2>
          <Link href="/businesses" className="text-sm text-[var(--color-primary)] hover:underline">
            Ver todos
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {businessStatusValues.map((status) => (
            <div
              key={status}
              className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            >
              <StatusBadge status={status} />
              <span className="text-sm font-semibold tabular-nums">
                {formatNumber(overview.clients.byStatus[status])}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-[var(--radius)] border border-dashed border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-fg-muted)]">
            +{formatNumber(overview.clients.newThisMonth)} este mes
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-[var(--color-fg-muted)]">
            Vencimientos y cartera
          </h2>
          <Link href="/billing" className="text-sm text-[var(--color-primary)] hover:underline">
            Ir a cartera
          </Link>
        </div>
        {urgent.length > 0 ? (
          <p className="flex items-center gap-2 rounded-[var(--radius)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="size-4 shrink-0" />
            {urgent.length} cliente(s) necesitan atención: vencen esta semana o tienen saldo pendiente.
          </p>
        ) : null}
        <Table>
          <THead>
            <tr>
              <TH>Cliente</TH>
              <TH>Estado</TH>
              <TH>Vence</TH>
              <TH className="text-right">Plan</TH>
              <TH className="text-right">Pendiente</TH>
            </tr>
          </THead>
          <tbody>
            {overview.renewals.length === 0 ? (
              <EmptyRow colSpan={5}>
                Ningún cliente tiene plan configurado todavía.
              </EmptyRow>
            ) : (
              overview.renewals.slice(0, 10).map((row) => (
                <TR key={row.businessId}>
                  <TD>
                    <Link href={`/businesses/${row.businessId}`} className="font-medium hover:underline">
                      {row.businessName}
                    </Link>
                  </TD>
                  <TD>
                    <StatusBadge status={row.status} />
                  </TD>
                  <TD>
                    <span className="block">{formatDate(row.validUntil)}</span>
                    <span
                      className={
                        row.daysRemaining < 0
                          ? "text-xs text-[var(--color-danger)]"
                          : row.daysRemaining <= 7
                            ? "text-xs text-amber-600"
                            : "text-xs text-[var(--color-fg-muted)]"
                      }
                    >
                      {formatDaysRemaining(row.daysRemaining)}
                    </span>
                  </TD>
                  <TD className="text-right tabular-nums">{formatMoney(row.price, row.currency)}</TD>
                  <TD className="text-right tabular-nums">
                    {row.outstanding > 0 ? (
                      <span className="font-medium text-[var(--color-danger)]">
                        {formatMoney(row.outstanding, row.currency)}
                      </span>
                    ) : (
                      <span className="text-[var(--color-fg-muted)]">—</span>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-[var(--color-fg-muted)]">
          Uso de tus clientes ({overview.usage.rangeDays} días)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Citas" value={formatNumber(overview.usage.appointments)} />
          <Stat label="Conversaciones" value={formatNumber(overview.usage.conversations)} />
          <Stat label="Gift cards" value={formatNumber(overview.usage.giftCards)} />
          <Stat
            label="Transaccionado"
            value={formatMoney(overview.usage.grossVolume, overview.currency)}
            hint="Va directo a la cuenta de cada spa"
          />
        </div>
      </section>
    </div>
  );
}
