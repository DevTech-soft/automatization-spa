import Link from "next/link";
import {
  AlertTriangle,
  CalendarCheck,
  CircleDollarSign,
  Clock,
  Gift,
  HandCoins,
  MessagesSquare,
  TrendingUp,
} from "lucide-react";
import type { OperatorOverview } from "@spa/shared";
import { businessStatusValues } from "@spa/shared";
import { Stat } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarList } from "@/components/charts/bar-list";
import { PageHeader } from "@/components/page-header";
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
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title="Inicio"
        description={`Tu cartera y el uso de tus clientes en los últimos ${overview.usage.rangeDays} días.`}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={<TrendingUp />}
          label="Ingreso mensual (MRR)"
          value={formatMoney(overview.revenue.mrr, overview.currency)}
          hint={`${overview.clients.billable} cliente(s) facturando`}
        />
        <Stat
          icon={<CircleDollarSign />}
          tone="success"
          label="Cobrado este mes"
          value={formatMoney(overview.revenue.collectedThisMonth, overview.currency)}
          delta={
            growth === null
              ? undefined
              : { percent: growth, label: "vs. mes anterior" }
          }
          hint={growth === null ? `Mes anterior: ${formatMoney(overview.revenue.collectedLastMonth, overview.currency)}` : undefined}
        />
        <Stat
          icon={<Clock />}
          tone="warning"
          label="Por cobrar"
          value={formatMoney(overview.revenue.outstanding, overview.currency)}
          hint={`${overview.invoices.sent + overview.invoices.overdue} cuenta(s) emitida(s)`}
        />
        <Stat
          icon={<AlertTriangle />}
          tone={overview.revenue.overdue > 0 ? "danger" : "success"}
          label="Vencido"
          value={formatMoney(overview.revenue.overdue, overview.currency)}
          hint={`${overview.invoices.overdue} cuenta(s) en mora`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Clientes</CardTitle>
              <CardDescription>+{formatNumber(overview.clients.newThisMonth)} este mes</CardDescription>
            </div>
            <Link href="/businesses" className="text-sm text-[var(--color-primary)] hover:underline">
              Ver todos
            </Link>
          </CardHeader>
          <CardContent>
            <BarList
              items={businessStatusValues.map((status) => ({
                key: status,
                label: <StatusBadge status={status} />,
                value: overview.clients.byStatus[status],
                display: formatNumber(overview.clients.byStatus[status]),
              }))}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Uso de tus clientes</CardTitle>
            <CardDescription>Últimos {overview.usage.rangeDays} días, todos los negocios</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <UsageTile icon={<CalendarCheck />} label="Citas" value={formatNumber(overview.usage.appointments)} />
            <UsageTile
              icon={<MessagesSquare />}
              label="Conversaciones"
              value={formatNumber(overview.usage.conversations)}
            />
            <UsageTile icon={<Gift />} label="Gift cards" value={formatNumber(overview.usage.giftCards)} />
            <UsageTile
              icon={<HandCoins />}
              label="Transaccionado"
              value={formatMoney(overview.usage.grossVolume, overview.currency)}
              hint="Va directo a la cuenta de cada spa"
            />
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Vencimientos y cartera</h2>
          <Link href="/billing" className="text-sm text-[var(--color-primary)] hover:underline">
            Ir a cartera
          </Link>
        </div>
        {urgent.length > 0 ? (
          <p className="flex items-center gap-2 rounded-lg bg-[var(--color-warning-soft)] px-3 py-2 text-sm text-[var(--color-warning)]">
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
                            ? "text-xs text-[var(--color-warning)]"
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

    </div>
  );
}

function UsageTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-[var(--color-surface)] p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-background)] text-[var(--color-primary)] [&>svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-fg-muted)]">{label}</p>
        <p className="text-lg font-semibold tracking-tight">{value}</p>
        {hint ? <p className="text-xs text-[var(--color-fg-muted)]">{hint}</p> : null}
      </div>
    </div>
  );
}
