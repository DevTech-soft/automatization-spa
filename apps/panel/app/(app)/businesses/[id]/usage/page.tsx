import type { BusinessUsage } from "@spa/shared";
import { parseUsageDays, UsageView } from "@/components/usage-view";
import { adminGet } from "@/lib/backend";

/**
 * Consumo de un cliente (docs/PANEL-OPERADOR.md F6): cuánto está usando lo que
 * paga. Es el argumento de la renovación —y, cuando el número es bajo, la señal
 * de que hay que acompañarlo antes de que se vaya.
 *
 * El "transaccionado" NO es ingreso del operador: esa plata va directo a la
 * cuenta de Wompi del spa (D3).
 */

type SearchParams = Promise<{ days?: string }>;

export default async function UsagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const days = parseUsageDays((await searchParams).days);
  const usage = await adminGet<BusinessUsage>(`/admin/businesses/${id}/usage?days=${days}`);

  return (
    <div className="flex flex-col gap-8">
      <UsageView usage={usage} days={days} basePath={`/businesses/${id}/usage`} />
      <p className="text-xs text-[var(--color-fg-muted)]">
        El valor transaccionado es lo que el spa recibió por Wompi en su propia cuenta; no es
        ingreso del operador.
      </p>
    </div>
  );
}
