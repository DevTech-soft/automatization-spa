"use server";

import { revalidatePath } from "next/cache";
import {
  createInvoiceSchema,
  invoiceActionSchema,
  registerPaymentSchema,
  type BillingRunResult,
  type OperatorInvoiceDetail,
} from "@spa/shared";
import { adminMutate, ApiError } from "@/lib/backend";
import type { FormState } from "../businesses/actions";

/**
 * Acciones de cartera (docs/PANEL-OPERADOR.md §6.4). Todas pasan por
 * `/admin/*`: el panel nunca toca Postgres (D10).
 */

function revalidateBilling(businessId?: string): void {
  revalidatePath("/billing");
  revalidatePath("/dashboard");
  if (businessId) {
    revalidatePath(`/businesses/${businessId}/subscription`);
  }
}

/** Emite la cuenta del próximo período desde el plan del negocio. */
export async function createInvoiceAction(
  businessId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createInvoiceSchema.safeParse({
    send: formData.get("send") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos." };
  }

  try {
    await adminMutate<OperatorInvoiceDetail>(
      "POST",
      `/admin/businesses/${businessId}/invoices`,
      parsed.data,
    );
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo emitir la cuenta de cobro." };
  }

  revalidateBilling(businessId);
  return { ok: true };
}

/** Marca una cuenta como enviada, o la anula. */
export async function invoiceActionAction(
  invoiceId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = invoiceActionSchema.safeParse({
    action: formData.get("action"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Acción inválida." };
  }

  try {
    await adminMutate<OperatorInvoiceDetail>("POST", `/admin/invoices/${invoiceId}/status`, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo actualizar la cuenta." };
  }

  revalidatePath(`/billing/${invoiceId}`);
  revalidateBilling();
  return { ok: true };
}

/** Genera el PDF (Puppeteer en el backend) y deja la URL en la fila. */
export async function generateInvoicePdfAction(
  invoiceId: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await adminMutate<{ pdfUrl: string }>("POST", `/admin/invoices/${invoiceId}/pdf`, {});
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo generar el PDF." };
  }

  revalidatePath(`/billing/${invoiceId}`);
  return { ok: true };
}

/**
 * Registra un pago recibido. Es la acción que mueve la vigencia del plan y
 * reactiva un negocio suspendido (§6.4) — de ahí que revalide también su ficha.
 */
export async function registerPaymentAction(
  businessId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = registerPaymentSchema.safeParse({
    paidAt: formData.get("paidAt"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    reference: formData.get("reference") ?? "",
    invoiceIds: formData.getAll("invoiceIds").filter((value): value is string => typeof value === "string"),
    ...(formData.get("extendDays") ? { extendDays: formData.get("extendDays") } : {}),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisa los campos.",
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [String(issue.path.at(-1) ?? "_"), [issue.message]]),
      ),
    };
  }

  try {
    await adminMutate("POST", `/admin/businesses/${businessId}/payments`, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    return { ok: false, error: "No se pudo registrar el pago." };
  }

  revalidateBilling(businessId);
  revalidatePath(`/businesses/${businessId}`);
  return { ok: true };
}

/** Corrida manual del ciclo diario, para ver el resultado sin esperar al cron. */
export async function runBillingCycleAction(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    const result = await adminMutate<BillingRunResult>("POST", "/admin/billing/run", {});
    revalidateBilling();
    return {
      ok: true,
      error: undefined,
      fieldErrors: undefined,
      message: `Corrida ${result.runDate}: ${result.invoicesCreated} emitida(s), ${result.invoicesOverdue} vencida(s), ${result.businessesSuspended} suspendido(s).`,
    };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo correr el ciclo de facturación." };
  }
}
