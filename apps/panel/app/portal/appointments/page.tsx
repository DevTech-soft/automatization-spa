import type { AppointmentRow, PaginatedResponse } from "@spa/shared";
import { AppointmentsTable } from "@/components/activity-tables";
import { stateLabel } from "@/components/ui/badge";
import { adminGet, requirePortalUser } from "@/lib/backend";
import { todayIn } from "@/lib/format";
import { appointmentActionPortal } from "../actions";
import { ListToolbar, listQuery } from "../list-toolbar";

const STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW", "EXPIRED"];

export default async function PortalAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { q, query, linkParams } = listQuery(sp, ["status", "from", "to"]);
  const [viewer, data] = await Promise.all([
    requirePortalUser(),
    adminGet<PaginatedResponse<AppointmentRow>>(`/portal/appointments?${query}`),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Citas</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Todas las reservas, del bot de WhatsApp, la página web y el agente.
        </p>
      </div>
      <ListToolbar
        action="/portal/appointments"
        q={q}
        placeholder="Código, nombre o teléfono"
        statuses={STATUSES.map((value) => [value, stateLabel(value)])}
        status={sp.status}
        dates={{ from: sp.from ?? "", to: sp.to ?? "" }}
      />
      <AppointmentsTable
        data={data}
        basePath="/portal/appointments"
        params={linkParams}
        emptyText="No hay citas con esos filtros."
        actions={{ today: todayIn(viewer.business.timezone), run: appointmentActionPortal }}
      />
    </div>
  );
}
