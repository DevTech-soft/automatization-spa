import { notFound } from "next/navigation";
import type { BusinessDetail } from "@spa/shared";
import { StatusBadge } from "@/components/ui/badge";
import { adminGet, ApiError } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";
import { BusinessTabs } from "./business-tabs";

/**
 * Cabecera + pestañas de un negocio. Cada pestaña carga su propia data
 * (`/admin/businesses/:id`, `.../branding`, `.../onboarding`); aquí solo se
 * resuelve el nombre y el estado que van en el encabezado.
 */
export default async function BusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let business: BusinessDetail;
  try {
    business = await adminGet<BusinessDetail>(`/admin/businesses/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        breadcrumbs={[{ href: "/businesses", label: "Negocios" }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {business.name}
            <StatusBadge status={business.status} />
          </span>
        }
        description={business.slug}
      />
      <BusinessTabs businessId={id} />
      <div>{children}</div>
    </div>
  );
}
