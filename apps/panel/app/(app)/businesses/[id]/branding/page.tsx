import { notFound } from "next/navigation";
import type { BusinessBranding } from "@spa/shared";
import { adminGet, ApiError } from "@/lib/backend";
import { BrandingForm } from "./branding-form";

export default async function BrandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let branding: BusinessBranding;
  try {
    branding = await adminGet<BusinessBranding>(`/admin/businesses/${id}/branding`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  return <BrandingForm branding={branding} />;
}
