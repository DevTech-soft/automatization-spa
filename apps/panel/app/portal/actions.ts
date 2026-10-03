"use server";

import { revalidatePath } from "next/cache";
import { adminMutate, ApiError } from "@/lib/backend";
import { parseAppointmentActionForm, type FormState } from "../(app)/businesses/actions";

/**
 * Server Actions del portal del spa (F7). El negocio no viaja en la URL: lo
 * fija el backend desde la sesión (`requirePortalSession`).
 */

export async function appointmentActionPortal(
  appointmentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = await parseAppointmentActionForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Acción inválida." };
  }

  try {
    await adminMutate("POST", `/portal/appointments/${appointmentId}/actions`, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo actualizar la cita." };
  }

  // Hoy, Citas y la ficha de la clienta muestran la misma cita.
  revalidatePath("/portal", "layout");
  return { ok: true };
}
