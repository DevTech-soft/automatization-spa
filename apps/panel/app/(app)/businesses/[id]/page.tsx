import { notFound } from "next/navigation";
import type { BusinessDetail } from "@spa/shared";
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

  return <BusinessForm business={business} />;
}
