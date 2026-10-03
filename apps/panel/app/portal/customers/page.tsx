import Link from "next/link";
import type { CustomerRow, PaginatedResponse } from "@spa/shared";
import { Pagination } from "@/components/pagination";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { adminGet, requirePortalUser } from "@/lib/backend";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { ListToolbar, listQuery } from "../list-toolbar";
import { PageHeader } from "@/components/page-header";

/**
 * Clientas del spa (CRM): quiénes reservan, cuántas veces y cuándo vinieron por
 * última vez. Nacen solas cuando alguien reserva (bot, web o agente).
 */
export default async function PortalCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const viewer = await requirePortalUser();
  const showMoney = viewer.role === "owner";
  const sp = await searchParams;
  const { q, query, linkParams } = listQuery(sp);
  const data = await adminGet<PaginatedResponse<CustomerRow>>(`/portal/customers?${query}`);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Clientas" description={`${formatNumber(data.total)} persona(s) han reservado con ustedes.`} />
      <ListToolbar action="/portal/customers" q={q} placeholder="Nombre, teléfono o correo" />
      <Table>
        <THead>
          <tr>
            <TH>Clienta</TH>
            <TH>Teléfono</TH>
            <TH className="text-right">Citas</TH>
            <TH>Última cita</TH>
            {showMoney ? <TH className="text-right">Total</TH> : null}
          </tr>
        </THead>
        <tbody>
          {data.items.length === 0 ? (
            <EmptyRow colSpan={showMoney ? 5 : 4}>
              {q ? "Nadie coincide con la búsqueda." : "Todavía no hay clientas."}
            </EmptyRow>
          ) : (
            data.items.map((row) => (
              <TR key={row.id}>
                <TD>
                  <Link href={`/portal/customers/${row.id}`} className="font-medium hover:underline">
                    {row.name}
                  </Link>
                  {row.email ? (
                    <span className="block text-xs text-[var(--color-fg-muted)]">{row.email}</span>
                  ) : null}
                </TD>
                <TD className="font-mono text-xs">{row.phone}</TD>
                <TD className="text-right tabular-nums">
                  {formatNumber(row.completedAppointments)}
                  {row.appointments > row.completedAppointments ? (
                    <span className="text-xs text-[var(--color-fg-muted)]"> / {formatNumber(row.appointments)}</span>
                  ) : null}
                </TD>
                <TD className="text-[var(--color-fg-muted)]">{formatDate(row.lastAppointmentDate)}</TD>
                {showMoney ? (
                  <TD className="text-right tabular-nums">{formatMoney(row.totalSpent, viewer.business.currency)}</TD>
                ) : null}
              </TR>
            ))
          )}
        </tbody>
      </Table>
      <p className="text-xs text-[var(--color-fg-muted)]">
        Citas: confirmadas o completadas / total reservadas (incluye canceladas y vencidas).
      </p>
      <Pagination data={data} basePath="/portal/customers" params={linkParams} />
    </div>
  );
}
