import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { BusinessDetail } from "@spa/shared";
import { StatusBadge } from "@/components/ui/badge";
import { adminGet, ApiError } from "@/lib/backend";
import { BusinessForm } from "../business-form";

export default async function BusinessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let business: BusinessDetail;
  try {
    business = await adminGet<BusinessDetail>(`/admin/businesses/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
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
      <BusinessForm business={business} />
    </div>
  );
}
