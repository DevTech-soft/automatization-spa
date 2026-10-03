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
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <BusinessForm business={business} />
      </div>
      <StatusForm business={business} />
    </div>
  );
}
