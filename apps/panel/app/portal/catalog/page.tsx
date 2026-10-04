import type { BusinessHourDto, ServiceDto } from "@spa/shared";
import { adminGet } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";
import { HoursEditor } from "../../(app)/businesses/[id]/catalog/hours-editor";
import { ServicesList } from "../../(app)/businesses/[id]/catalog/services-list";
import { requireOwner } from "../owner-only";

/**
 * Catálogo desde el portal: el dueño(a) carga sus servicios y horarios sin
 * pedírselo al operador. Mismos componentes que la pestaña Catálogo del panel;
 * `businessId={null}` hace que las acciones vayan a `/portal/*`.
 */
export default async function PortalCatalogPage() {
  const { business } = await requireOwner();
  const [services, hours] = await Promise.all([
    adminGet<ServiceDto[]>("/portal/services"),
    adminGet<BusinessHourDto[]>("/portal/hours"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Servicios y horarios"
        description="Lo que tu asistente de WhatsApp y tu página de reservas ofrecen, y cuándo."
      />
      <ServicesList businessId={null} services={services} currency={business.currency} />
      <HoursEditor businessId={null} hours={hours} timezone={business.timezone} />
    </div>
  );
}
