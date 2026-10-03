import type { BusinessDetail, BusinessHourDto, ServiceDto } from "@spa/shared";
import { adminGet } from "@/lib/backend";
import { HoursEditor } from "./hours-editor";
import { ServicesList } from "./services-list";

/**
 * Catálogo del negocio (docs/PANEL-OPERADOR.md §6.1 pasos 3–4): lo que el bot,
 * el agente y `/reservar` ofrecen, y cuándo. Antes solo se cargaba por seed.
 */
export default async function CatalogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [business, services, hours] = await Promise.all([
    adminGet<BusinessDetail>(`/admin/businesses/${id}`),
    adminGet<ServiceDto[]>(`/admin/businesses/${id}/services`),
    adminGet<BusinessHourDto[]>(`/admin/businesses/${id}/hours`),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <ServicesList businessId={id} services={services} currency={business.currency} />
      <HoursEditor businessId={id} hours={hours} timezone={business.timezone} />
    </div>
  );
}
