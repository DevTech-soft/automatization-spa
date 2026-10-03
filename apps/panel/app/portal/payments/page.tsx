import type { PaginatedResponse, PaymentRow } from "@spa/shared";
import { PaymentsTable } from "@/components/activity-tables";
import { stateLabel } from "@/components/ui/badge";
import { adminGet } from "@/lib/backend";
import { ListToolbar, listQuery } from "../list-toolbar";
import { requireOwner } from "../owner-only";
import { PageHeader } from "@/components/page-header";

const STATUSES = ["PENDING", "PAID", "DEPOSIT_PAID", "FAILED", "EXPIRED", "REFUNDED"];

export default async function PortalPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireOwner();
  const sp = await searchParams;
  const { q, query, linkParams } = listQuery(sp, ["status", "from", "to"]);
  const data = await adminGet<PaginatedResponse<PaymentRow>>(`/portal/transactions?${query}`);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Pagos en línea"
        description="Pagos de reservas y gift cards por Wompi. La plata llega directo a la cuenta del negocio."
      />
      <ListToolbar
        action="/portal/payments"
        q={q}
        placeholder="Referencia"
        statuses={STATUSES.map((value) => [value, stateLabel(value)])}
        status={sp.status}
        dates={{ from: sp.from ?? "", to: sp.to ?? "" }}
      />
      <PaymentsTable data={data} basePath="/portal/payments" params={linkParams} />
    </div>
  );
}
