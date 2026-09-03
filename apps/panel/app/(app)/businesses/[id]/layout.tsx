import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { BusinessDetail } from "@spa/shared";
import { StatusBadge } from "@/components/ui/badge";
import { adminGet, ApiError } from "@/lib/backend";
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
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link
        href="/businesses"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ChevronLeft className="size-4" />
        Negocios
      </Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{business.name}</h1>
        <StatusBadge status={business.status} />
      </div>
      <BusinessTabs businessId={id} />
      {children}
    </div>
  );
}
