import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Mail, Phone } from "lucide-react";
import type { CustomerDetail } from "@spa/shared";
import { StateBadge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { adminGet, ApiError, requirePortalUser } from "@/lib/backend";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

export default async function PortalCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requirePortalUser();
  const currency = viewer.business.currency;
  const showMoney = viewer.role === "owner";

  let customer: CustomerDetail;
  try {
    customer = await adminGet<CustomerDetail>(`/portal/customers/${id}`);
  } catch (e) {
    // 400 (id mal formado) y 404 (no existe o es de otro negocio) se ven igual.
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }

  const whatsappLink = `https://wa.me/${customer.phone.replace(/\D/g, "")}`;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/portal/customers"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ChevronLeft className="size-4" />
        Clientas
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{customer.name}</h1>
        <div className="flex flex-wrap gap-4 text-sm text-[var(--color-fg-muted)]">
          <a href={whatsappLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
            <Phone className="size-3.5" />
            {customer.phone}
          </a>
          {customer.email ? (
            <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1.5 hover:underline">
              <Mail className="size-3.5" />
              {customer.email}
            </a>
          ) : null}
          <span>Clienta desde {formatDate(customer.createdAt)}</span>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Citas"
          value={formatNumber(customer.completedAppointments)}
          hint={`${formatNumber(customer.appointments)} reservadas en total`}
        />
        <Stat label="Última cita" value={formatDate(customer.lastAppointmentDate)} />
        {showMoney ? <Stat label="Total" value={formatMoney(customer.totalSpent, currency)} /> : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Historial</h2>
        <Table>
          <THead>
            <tr>
              <TH>Fecha</TH>
              <TH>Servicio</TH>
              <TH>Estado</TH>
              <TH className="text-right">Valor</TH>
            </tr>
          </THead>
          <tbody>
            {customer.history.length === 0 ? (
              <EmptyRow colSpan={4}>Sin citas.</EmptyRow>
            ) : (
              customer.history.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <span className="block">{formatDate(row.date)}</span>
                    <span className="text-xs text-[var(--color-fg-muted)]">
                      {row.startTime} · <span className="font-mono">{row.code}</span>
                    </span>
                  </TD>
                  <TD>{row.serviceName}</TD>
                  <TD className="space-x-1">
                    <StateBadge value={row.status} />
                    <StateBadge value={row.paymentStatus} />
                  </TD>
                  <TD className="text-right tabular-nums">{formatMoney(row.price, currency)}</TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
