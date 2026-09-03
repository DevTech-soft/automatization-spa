"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  agentFieldOrder,
  createBusinessSchema,
  onboardingManualSchema,
  updateBrandingSchema,
  updateBusinessSchema,
  type BusinessBranding,
  type BusinessDetail,
  type OnboardingChecklist,
} from "@spa/shared";
import { adminMutate, ApiError } from "@/lib/backend";

export interface FormState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Los errores se indexan por el **último** segmento del path de Zod, que es el
 * `name` del input: para los campos anidados de la persona del agente el path
 * es `["agent", "nombreAgente"]` pero el input se llama `nombreAgente`.
 */
function zodToFieldErrors(issues: { path: (string | number)[]; message: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = String(issue.path.at(-1) ?? "_");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Revalida las tres pestañas del negocio + el listado. */
function revalidateBusiness(id: string): void {
  revalidatePath(`/businesses/${id}`);
  revalidatePath(`/businesses/${id}/branding`);
  revalidatePath(`/businesses/${id}/onboarding`);
  revalidatePath("/businesses");
}

export async function createBusinessAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createBusinessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos.", fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  let created: BusinessDetail;
  try {
    created = await adminMutate<BusinessDetail>("POST", "/admin/businesses", parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    return { ok: false, error: "No se pudo crear el negocio." };
  }

  revalidatePath("/businesses");
  redirect(`/businesses/${created.id}`);
}

export async function updateBusinessAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const payload: Record<string, unknown> = Object.fromEntries(formData);
  // Checkbox: presente = "on", ausente = sin key.
  payload.active = formData.get("active") === "on";
  // Sin valor (modo total, o campo vacío) → se omite; el backend limpia el % al pasar a total.
  if (payload.depositPercentage === "" || payload.depositPercentage == null) {
    delete payload.depositPercentage;
  }
  const parsed = updateBusinessSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos.", fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  try {
    await adminMutate<BusinessDetail>("PATCH", `/admin/businesses/${id}`, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    return { ok: false, error: "No se pudo guardar." };
  }

  revalidateBusiness(id);
  return { ok: true };
}

// — Marca (§6.1 paso 2) —

export async function updateBrandingAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const agent: Record<string, string> = {};
  for (const key of agentFieldOrder) {
    const value = formData.get(key);
    if (typeof value === "string") agent[key] = value;
  }

  const parsed = updateBrandingSchema.safeParse({
    logoUrl: formData.get("logoUrl") ?? "",
    colorPrimary: formData.get("colorPrimary") ?? "",
    colorSecondary: formData.get("colorSecondary") ?? "",
    // Checkbox: presente = "on", ausente = sin key.
    agentEnabled: formData.get("agentEnabled") === "on",
    agent,
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos.", fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  try {
    await adminMutate<BusinessBranding>("PATCH", `/admin/businesses/${id}/branding`, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    return { ok: false, error: "No se pudo guardar la marca." };
  }

  revalidateBusiness(id);
  return { ok: true };
}

// — Checklist de onboarding (§6.1) —

/** Marca/desmarca un paso que el operador confirma a mano. */
export async function setOnboardingFlagAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = onboardingManualSchema.safeParse({
    whatsappProfileApproved: formData.get("whatsappProfileApproved") === "true",
  });
  if (!parsed.success) {
    return { ok: false, error: "Valor inválido." };
  }

  try {
    await adminMutate<OnboardingChecklist>("PATCH", `/admin/businesses/${id}/onboarding`, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo actualizar el checklist." };
  }

  revalidateBusiness(id);
  return { ok: true };
}

/** Paso 9: `TRIAL` → `ACTIVE`. El backend revalida el checklist completo. */
export async function activateBusinessAction(
  id: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await adminMutate<OnboardingChecklist>("POST", `/admin/businesses/${id}/activate`, {});
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo activar el negocio." };
  }

  revalidateBusiness(id);
  return { ok: true };
}
