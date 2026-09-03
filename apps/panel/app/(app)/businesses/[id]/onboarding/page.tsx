import { notFound } from "next/navigation";
import type { OnboardingChecklist } from "@spa/shared";
import { adminGet, ApiError } from "@/lib/backend";
import { OnboardingChecklistView } from "./checklist";

export default async function OnboardingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let checklist: OnboardingChecklist;
  try {
    checklist = await adminGet<OnboardingChecklist>(`/admin/businesses/${id}/onboarding`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  return <OnboardingChecklistView checklist={checklist} />;
}
