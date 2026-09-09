import Link from "next/link";
import type { BusinessUsage } from "@spa/shared";
import { Stat } from "@/components/ui/stat";
import { Table, TD, TH, THead, TR, EmptyRow } from "@/components/ui/table";
import { stateLabel } from "@/components/ui/badge";
import { adminGet } from "@/lib/backend";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Consumo de un cliente (docs/PANEL-OPERADOR.md F6): cuánto está usando lo que
 * paga. Es el argumento de la renovación —y, cuando el número es bajo, la señal
 * de que hay que acompañarlo antes de que se vaya.
 *
 * El "transaccionado" NO es ingreso del operador: esa plata va directo a la
 * cuenta de Wompi del spa (D3).
 */

const RANGES = [7, 30, 90];

type SearchParams = Promise<{ days?: string }>;

export default async function UsagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 30;

  const usage = await adminGet<BusinessUsage>(`/admin/businesses/${id}/usage?days=${days}`);
  const maxAppointments = Math.max(1, ...usage.series.map((point) => point.appointments));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-fg-muted)]">
          {formatDate(usage.from)} – {formatDate(usage.to)}
        </p>
        <nav className="flex gap-2">
          {RANGES.map((range) => (
            <Link
              key={range}
              href={`/businesses/${id}/usage?days=${range}`}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                range === days
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                  : "border-[var(--color-border)] hover:bg-[var(--color-surface)]",
              )}
            >
              {range} días
            </Link>
          ))}
        </nav>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Citas"
          value={formatNumber(usage.appointments.total)}
          hint={`${usage.appointments.confirmed} confirmadas · ${usage.appointments.cancelled} canceladas`}
        />
        <Stat
          label="Transaccionado"
          value={formatMoney(usage.revenue.grossVolume, usage.currency)}
          hint={`${usage.revenue.paidCount} pago(s) aprobados`}
        />
        <Stat
          label="Conversaciones"
          value={formatNumber(usage.conversations.active)}
          hint={`${usage.conversations.total} en total · último ${formatDateTime(
            usage.conversations.lastMessageAt,
          )}`}
        />
        <Stat
          label="Gift cards"
          value={formatNumber(usage.giftCards.sold)}
          hint={`${usage.giftCards.redeemed} redimidas · ${formatMoney(
            usage.giftCards.amount,
            usage.currency,
          )}`}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Citas por día</h2>
        {usage.series.length === 0 ? (
          <p className="text-sm text-[var(--color-fg-muted)]">Sin actividad en el rango.</p>
        ) : (
          <div className="flex h-32 items-end gap-1 overflow-x-auto rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] p-3">
            {usage.series.map((point) => (
              <div
                key={point.date}
                className="flex min-w-2 flex-1 flex-col justify-end"
                title={`${formatDate(point.date)}: ${point.appointments} cita(s), ${formatMoney(
                  point.revenue,
                  usage.currency,
                )}`}
              >
                <div
                  className="rounded-t bg-[var(--color-primary)]"
                  style={{ height: `${(point.appointments / maxAppointments) * 100}%`, minHeight: "2px" }}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Cómo reservan</h2>
          <Table>
            <THead>
              <tr>
                <TH>Canal</TH>
                <TH className="text-right">Citas</TH>
              </tr>
            </THead>
            <tbody>
              {Object.keys(usage.appointments.bySource).length === 0 ? (
                <EmptyRow colSpan={2}>Sin datos en el rango.</EmptyRow>
              ) : (
                Object.entries(usage.appointments.bySource).map(([source, count]) => (
                  <TR key={source}>
                    <TD>{stateLabel(source)}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(count)}</TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Servicios más pedidos</h2>
          <Table>
            <THead>
              <tr>
                <TH>Servicio</TH>
                <TH className="text-right">Citas</TH>
                <TH className="text-right">Valor</TH>
              </tr>
            </THead>
            <tbody>
              {usage.topServices.length === 0 ? (
                <EmptyRow colSpan={3}>Sin datos en el rango.</EmptyRow>
              ) : (
                usage.topServices.map((service) => (
                  <TR key={service.serviceId}>
                    <TD>{service.name}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(service.appointments)}</TD>
                    <TD className="text-right tabular-nums">
                      {formatMoney(service.revenue, usage.currency)}
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </div>
      </section>

      <p className="text-xs text-[var(--color-fg-muted)]">
        El valor transaccionado es lo que el spa recibió por Wompi en su propia cuenta; no es
        ingreso del operador.
      </p>
    </div>
  );
}
