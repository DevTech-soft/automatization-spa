import Link from "next/link";
import type { BusinessUsage } from "@spa/shared";
import { CalendarCheck, Gift, MessagesSquare, Wallet } from "lucide-react";
import { Stat } from "@/components/ui/stat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { stateLabel } from "@/components/ui/badge";
import { ColumnChart } from "@/components/charts/column-chart";
import { BarList } from "@/components/charts/bar-list";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const USAGE_RANGES = [7, 30, 90];

/** Rango válido de la query `?days=` (30 por defecto). */
export function parseUsageDays(value: string | undefined): number {
  return USAGE_RANGES.includes(Number(value)) ? Number(value) : 30;
}

/**
 * Consumo de un negocio en un rango: citas, plata transaccionada,
 * conversaciones, gift cards, serie diaria y top de servicios. Lo pintan la
 * pestaña Consumo del operador y las métricas del portal del dueño(a) (F7).
 */
export function UsageView({
  usage,
  days,
  basePath,
}: {
  usage: BusinessUsage;
  days: number;
  /** Ruta de la página; los botones de rango agregan `?days=`. */
  basePath: string;
}) {
  const shortDate = (date: string) => formatDate(date).replace(/ \d{4}$/, "");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-fg-muted)]">
          {formatDate(usage.from)} – {formatDate(usage.to)}
        </p>
        <nav className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-1" aria-label="Rango">
          {USAGE_RANGES.map((range) => (
            <Link
              key={range}
              href={`${basePath}?days=${range}`}
              aria-current={range === days ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                range === days
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                  : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
              )}
            >
              {range} días
            </Link>
          ))}
        </nav>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={<CalendarCheck />}
          label="Citas"
          value={formatNumber(usage.appointments.total)}
          hint={`${usage.appointments.confirmed} confirmadas · ${usage.appointments.cancelled} canceladas`}
        />
        <Stat
          icon={<Wallet />}
          tone="success"
          label="Transaccionado"
          value={formatMoney(usage.revenue.grossVolume, usage.currency)}
          hint={`${usage.revenue.paidCount} pago(s) aprobados`}
        />
        <Stat
          icon={<MessagesSquare />}
          label="Conversaciones"
          value={formatNumber(usage.conversations.active)}
          hint={`${usage.conversations.total} en total · último ${formatDateTime(usage.conversations.lastMessageAt)}`}
        />
        <Stat
          icon={<Gift />}
          tone="warning"
          label="Gift cards"
          value={formatNumber(usage.giftCards.sold)}
          hint={`${usage.giftCards.redeemed} redimidas · ${formatMoney(usage.giftCards.amount, usage.currency)}`}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Citas por día</CardTitle>
          <CardDescription>Pasa el mouse por una columna para ver el detalle del día.</CardDescription>
        </CardHeader>
        <CardContent>
          <ColumnChart
            tableCaption="Citas por día"
            emptyText="Sin actividad en el rango."
            points={usage.series.map((point) => ({
              key: point.date,
              label: shortDate(point.date),
              value: point.appointments,
              tooltip: [
                formatDate(point.date),
                `${formatNumber(point.appointments)} cita(s)`,
                formatMoney(point.revenue, usage.currency),
              ],
            }))}
          />
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cómo reservan</CardTitle>
            <CardDescription>Citas por canal</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              items={Object.entries(usage.appointments.bySource)
                .sort((a, b) => b[1] - a[1])
                .map(([source, count]) => ({
                  key: source,
                  label: stateLabel(source),
                  value: count,
                  display: formatNumber(count),
                }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Servicios más pedidos</CardTitle>
            <CardDescription>Por número de citas</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              items={usage.topServices.map((service) => ({
                key: service.serviceId,
                label: (
                  <>
                    {service.name}{" "}
                    <span className="text-[var(--color-fg-muted)]">· {formatMoney(service.revenue, usage.currency)}</span>
                  </>
                ),
                value: service.appointments,
                display: `${formatNumber(service.appointments)} citas`,
              }))}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
