import type { BusinessUsage } from "@spa/shared";
import { parseUsageDays, UsageView } from "@/components/usage-view";
import { adminGet } from "@/lib/backend";
import { requireOwner } from "../owner-only";
import { PageHeader } from "@/components/page-header";

export default async function PortalMetricsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireOwner();
  const days = parseUsageDays((await searchParams).days);
  const usage = await adminGet<BusinessUsage>(`/portal/usage?days=${days}`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Métricas" description="Cómo le va al negocio: citas, ventas y canales." />
      <UsageView usage={usage} days={days} basePath="/portal/metrics" />
    </div>
  );
}
