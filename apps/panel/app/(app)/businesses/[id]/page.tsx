import { notFound } from "next/navigation";
import type { BusinessDetail } from "@spa/shared";
import { adminGet, ApiError } from "@/lib/backend";
import { BusinessForm } from "../business-form";
import { StatusForm } from "./status-form";

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
    <div className="flex flex-col gap-8">
      <BusinessForm business={business} />
      <div className="border-t border-[var(--color-border)] pt-6">
        <StatusForm business={business} />
      </div>
    </div>
  );
}
