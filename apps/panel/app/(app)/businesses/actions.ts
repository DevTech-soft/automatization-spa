"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createBusinessSchema,
  updateBusinessSchema,
  type BusinessDetail,
} from "@spa/shared";
import { adminMutate, ApiError } from "@/lib/backend";

export interface FormState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function zodToFieldErrors(issues: { path: (string | number)[]; message: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "_");
    (out[key] ??= []).push(issue.message);
  }
  return out;
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

  revalidatePath(`/businesses/${id}`);
  revalidatePath("/businesses");
  return { ok: true };
}
