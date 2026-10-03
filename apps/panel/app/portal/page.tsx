import Link from "next/link";
import type { AppointmentRow, PaginatedResponse } from "@spa/shared";
import { AppointmentsTable } from "@/components/activity-tables";
import { StateBadge } from "@/components/ui/badge";
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
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Hola, {viewer.name.split(" ")[0]}</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">{formatDate(today)}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Citas hoy" value={formatNumber(live.length)} hint={`${confirmed.length} confirmadas`} />
        <Stat
          label="Esperando pago"
          value={formatNumber(pending.length)}
          hint="Se liberan solas si no pagan a tiempo"
          tone={pending.length > 0 ? "warning" : "default"}
        />
        <Stat
          label="Saldo a cobrar en el local"
          value={formatMoney(toCollect, currency)}
          hint="Lo que falta de las citas con abono"
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Agenda de hoy</h2>
        {live.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] bg-[var(--color-background)] px-4 py-8 text-center text-sm text-[var(--color-fg-muted)]">
            No hay citas para hoy.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)]">
            {live.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="w-24 font-mono text-sm tabular-nums">
                  {row.startTime}–{row.endTime}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{row.customerName}</span>
                  <span className="text-sm text-[var(--color-fg-muted)]">
                    {row.serviceName}
                    {row.customerPhone ? ` · ${row.customerPhone}` : ""}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <StateBadge value={row.status} />
                  <StateBadge value={row.paymentStatus} />
                </span>
                {row.pendingBalance ? (
                  <span className="w-full text-xs text-[var(--color-fg-muted)] sm:w-auto">
                    cobrar {formatMoney(row.pendingBalance, currency)}
                  </span>
                ) : null}
                <span className="w-full sm:w-auto">
                  <AppointmentActions appointment={row} today={today} run={appointmentActionPortal} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Próximos 7 días</h2>
          <Link href="/portal/appointments" className="text-sm text-[var(--color-fg-muted)] hover:underline">
            Ver todas las citas
          </Link>
        </div>
        <AppointmentsTable data={{ ...upcoming, totalPages: 1 }} basePath="/portal" params={{}} emptyText="Sin citas en los próximos 7 días." />
      </section>
    </div>
  );
}
