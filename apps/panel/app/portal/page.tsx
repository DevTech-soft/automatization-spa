import Link from "next/link";
import type { AppointmentRow, PaginatedResponse } from "@spa/shared";
import { AppointmentsTable } from "@/components/activity-tables";
import { CalendarCheck, HandCoins, Hourglass } from "lucide-react";
import { StateBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/ui/stat";
import { adminGet, requirePortalUser } from "@/lib/backend";
import { formatDate, formatMoney, formatNumber, todayIn } from "@/lib/format";
import { AppointmentActions } from "@/components/appointment-actions";
import { appointmentActionPortal } from "./actions";

/**
 * Portada del portal: la agenda de hoy y lo que viene en la semana. Es lo que
 * la recepción abre al llegar; las métricas viven en su propia pestaña (dueño).
 */
export default async function PortalHomePage() {
  const viewer = await requirePortalUser();
  const { timezone, currency } = viewer.business;
  const today = todayIn(timezone);
  const tomorrow = todayIn(timezone, 1);
  const weekEnd = todayIn(timezone, 7);

  const [todayList, upcoming] = await Promise.all([
    adminGet<PaginatedResponse<AppointmentRow>>(
      `/portal/appointments?${new URLSearchParams({ from: today, to: today, order: "asc", pageSize: "100" })}`,
    ),
    adminGet<PaginatedResponse<AppointmentRow>>(
      `/portal/appointments?${new URLSearchParams({ from: tomorrow, to: weekEnd, order: "asc", pageSize: "10" })}`,
    ),
  ]);

  // Lo expirado o cancelado no ocupa la agenda: se cuenta aparte.
  const live = todayList.items.filter((row) => !["CANCELLED", "EXPIRED"].includes(row.status));
  const confirmed = live.filter((row) => row.status === "CONFIRMED" || row.status === "COMPLETED");
  const pending = live.filter((row) => row.status === "PENDING");
  const toCollect = live.reduce((sum, row) => sum + (row.pendingBalance ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Hola, ${viewer.name.split(" ")[0]}`} description={formatDate(today)} />

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<CalendarCheck />}
          label="Citas hoy"
          value={formatNumber(live.length)}
          hint={`${confirmed.length} confirmadas`}
        />
        <Stat
          icon={<Hourglass />}
          label="Esperando pago"
          value={formatNumber(pending.length)}
          hint="Se liberan solas si no pagan a tiempo"
          tone={pending.length > 0 ? "warning" : "default"}
        />
        <Stat
          icon={<HandCoins />}
          tone="success"
          label="Saldo a cobrar en el local"
          value={formatMoney(toCollect, currency)}
          hint="Lo que falta de las citas con abono"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Agenda de hoy</CardTitle>
          <CardDescription>Marca cada cita como atendida o no asistió al terminar.</CardDescription>
        </CardHeader>
        {live.length === 0 ? (
          <CardContent>
            <p className="py-6 text-center text-sm text-[var(--color-fg-muted)]">No hay citas para hoy.</p>
          </CardContent>
        ) : (
          <ol className="flex flex-col divide-y divide-[var(--color-border)]">
            {live.map((row) => (
              <li key={row.id} className="flex flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:gap-4">
                <div className="flex flex-wrap items-center gap-2 md:contents">
                  <span className="w-fit shrink-0 rounded-lg bg-[var(--color-primary-soft)] px-2 py-1 font-mono text-sm tabular-nums text-[var(--color-primary)] md:w-28 md:text-center">
                    {row.startTime}–{row.endTime}
                  </span>
                  <span className="flex flex-wrap items-center gap-1 md:order-last">
                    <StateBadge value={row.status} />
                    <StateBadge value={row.paymentStatus} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{row.customerName}</p>
                  <p className="text-sm text-[var(--color-fg-muted)]">
                    {row.serviceName}
                    {row.customerPhone ? ` · ${row.customerPhone}` : ""}
                  </p>
                  {row.pendingBalance ? (
                    <p className="text-xs text-[var(--color-fg-muted)]">
                      cobrar {formatMoney(row.pendingBalance, currency)}
                    </p>
                  ) : null}
                </div>
                <div className="md:order-last">
                  <AppointmentActions appointment={row} today={today} run={appointmentActionPortal} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Próximos 7 días</h2>
          <Link href="/portal/appointments" className="text-sm text-[var(--color-primary)] hover:underline">
            Ver todas las citas
          </Link>
        </div>
        <AppointmentsTable data={{ ...upcoming, totalPages: 1 }} basePath="/portal" params={{}} emptyText="Sin citas en los próximos 7 días." />
      </section>
    </div>
  );
}
