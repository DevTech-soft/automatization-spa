"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  agentFieldOrder,
  appointmentActionSchema,
  changeStatusSchema,
  connectWhatsAppSchema,
  createBusinessSchema,
  createBusinessUserSchema,
  embeddedSignupCallbackSchema,
  extendSubscriptionSchema,
  onboardingManualSchema,
  updateBrandingSchema,
  updateBusinessSchema,
  updateBusinessHoursSchema,
  updateBusinessUserSchema,
  updateServiceSchema,
  upsertContactSchema,
  upsertServiceSchema,
  upsertPaymentCredentialsSchema,
  upsertSubscriptionSchema,
  type BusinessBranding,
  type BusinessDetail,
  type BusinessHourDto,
  type BusinessUserCredentials,
  type BusinessUserDto,
  type ClientContactDto,
  type OnboardingChecklist,
  type PaymentCredentialsDto,
  type ServiceDto,
  type SubscriptionPlanDto,
  type EmbeddedSignupCallbackInput,
  type EmbeddedSignupResult,
  type WhatsAppAccountDto,
  type WhatsAppHealth,
  type WhatsAppSignupSessionDto,
} from "@spa/shared";
import { adminDelete, adminMutate, ApiError } from "@/lib/backend";

export interface FormState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Texto de éxito a medida; sin él, `FormAlert` muestra "Cambios guardados." */
  message?: string;
}

/**
 * `FormState` + la URL del enlace recién creado (§7.4). Va aparte porque es el
 * único dato del panel que no se puede volver a consultar: al listar, los
 * enlaces vienen sin token.
 */
export interface SignupLinkState extends FormState {
  url?: string | null;
}

/**
 * `FormState` + la contraseña temporal de un usuario del portal (F7). Como la
 * URL del enlace de auto-conexión, solo existe en esta respuesta.
 */
export interface UserCredentialsState extends FormState {
  email?: string;
  temporaryPassword?: string;
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

/**
 * Revalida todas las pestañas del negocio + el listado. Se revalida en bloque a
 * propósito: casi todo cambio cruza pestañas (guardar el plan mueve el
 * checklist de onboarding; conectar WhatsApp también), y son páginas baratas.
 */
const BUSINESS_TABS = [
  "",
  "/branding",
  "/onboarding",
  "/catalog",
  "/subscription",
  "/integrations",
  "/activity",
  "/conversations",
  "/usage",
  "/contacts",
  "/users",
];

function revalidateBusiness(id: string): void {
  for (const tab of BUSINESS_TABS) {
    revalidatePath(`/businesses/${id}${tab}`);
  }
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

// — Estado del negocio (§5) —

/** Suspender, reactivar o cancelar. Exige motivo y queda en la bitácora. */
export async function changeStatusAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = changeStatusSchema.safeParse({
    status: formData.get("status"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Escribe el motivo del cambio.", fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  try {
    await adminMutate<BusinessDetail>("POST", `/admin/businesses/${id}/status`, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo cambiar el estado." };
  }

  revalidateBusiness(id);
  revalidatePath("/dashboard");
  return { ok: true, message: "Estado actualizado." };
}

// — Plan de suscripción (§6.5) —

export async function upsertSubscriptionAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = upsertSubscriptionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos.", fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  try {
    await adminMutate<SubscriptionPlanDto>("PUT", `/admin/businesses/${id}/subscription`, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    return { ok: false, error: "No se pudo guardar el plan." };
  }

  revalidateBusiness(id);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Corre la vigencia sin cobrar (cortesías, extender la prueba). */
export async function extendSubscriptionAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = extendSubscriptionSchema.safeParse({
    days: formData.get("days"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Indica cuántos días.", fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  try {
    const plan = await adminMutate<SubscriptionPlanDto>(
      "POST",
      `/admin/businesses/${id}/subscription/extend`,
      parsed.data,
    );
    revalidateBusiness(id);
    revalidatePath("/dashboard");
    return { ok: true, message: `Nueva vigencia: ${plan.validUntil}.` };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo extender la vigencia." };
  }
}

// — Integraciones (§7 y §D3) —

export async function connectWhatsAppAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = connectWhatsAppSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Revisa los datos de Meta.", fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  try {
    await adminMutate<WhatsAppAccountDto>("POST", `/admin/businesses/${id}/whatsapp`, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    return { ok: false, error: "No se pudo conectar el número." };
  }

  revalidateBusiness(id);
  return { ok: true, message: "Número conectado." };
}

/** Consulta la Graph API y guarda calidad y límite de mensajería del número. */
export async function verifyWhatsAppAction(
  id: string,
  accountId: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    const health = await adminMutate<WhatsAppHealth>(
      "POST",
      `/admin/businesses/${id}/whatsapp/${accountId}/verify`,
      {},
    );
    revalidateBusiness(id);
    return health.ok ? { ok: true, message: health.detail } : { ok: false, error: health.detail };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo verificar el número." };
  }
}

/**
 * Genera el enlace de auto-conexión (§7.4) y lo devuelve **en el estado del
 * formulario**, no en la página: la URL con el token solo existe en esta
 * respuesta, así que si se pierde hay que generar otra.
 */
export async function createSignupLinkAction(
  id: string,
  _prev: SignupLinkState,
  _formData: FormData,
): Promise<SignupLinkState> {
  let session: WhatsAppSignupSessionDto;
  try {
    session = await adminMutate<WhatsAppSignupSessionDto>(
      "POST",
      `/admin/businesses/${id}/whatsapp/signup-links`,
      {},
    );
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo generar el enlace." };
  }

  revalidateBusiness(id);
  return { ok: true, message: "Enlace generado. Cópialo ahora: no se vuelve a mostrar.", url: session.url };
}

export async function revokeSignupLinkAction(
  id: string,
  sessionId: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await adminDelete(`/admin/businesses/${id}/whatsapp/signup-links/${sessionId}`);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo cancelar el enlace." };
  }

  revalidateBusiness(id);
  return { ok: true, message: "Enlace cancelado." };
}

/**
 * El signup hecho desde el panel: el popup de Facebook se abrió en el browser
 * del operador (con el cliente al lado) y devolvió estos tres datos. El `code`
 * se manda al backend sin tocar: canjearlo exige el App Secret, que no baja
 * nunca al navegador.
 */
export async function completeEmbeddedSignupAction(
  id: string,
  input: EmbeddedSignupCallbackInput,
): Promise<FormState> {
  const parsed = embeddedSignupCallbackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Meta no devolvió los datos completos del número." };
  }

  let result: EmbeddedSignupResult;
  try {
    result = await adminMutate<EmbeddedSignupResult>(
      "POST",
      `/admin/businesses/${id}/whatsapp/embedded-signup`,
      parsed.data,
    );
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo completar la conexión con Meta." };
  }

  revalidateBusiness(id);
  return {
    ok: true,
    message: `${result.account.displayPhoneNumber ?? "El número"} quedó conectado.`,
  };
}

export async function disconnectWhatsAppAction(
  id: string,
  accountId: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await adminDelete(`/admin/businesses/${id}/whatsapp/${accountId}`);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo desconectar el número." };
  }

  revalidateBusiness(id);
  return { ok: true, message: "Número desconectado." };
}

export async function upsertPaymentCredentialsAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = upsertPaymentCredentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Revisa las llaves.", fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  try {
    await adminMutate<PaymentCredentialsDto>(
      "PUT",
      `/admin/businesses/${id}/payment-credentials`,
      parsed.data,
    );
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    return { ok: false, error: "No se pudieron guardar las llaves." };
  }

  revalidateBusiness(id);
  return { ok: true, message: "Llaves guardadas y cifradas." };
}

export async function deletePaymentCredentialsAction(
  id: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await adminDelete(`/admin/businesses/${id}/payment-credentials`);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudieron eliminar las llaves." };
  }

  revalidateBusiness(id);
  return { ok: true, message: "El negocio vuelve a las llaves globales." };
}

// — Contactos del cliente (§4) —

export async function saveContactAction(
  id: string,
  contactId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = upsertContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos.", fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  try {
    if (contactId) {
      await adminMutate<ClientContactDto>("PATCH", `/admin/businesses/${id}/contacts/${contactId}`, parsed.data);
    } else {
      await adminMutate<ClientContactDto>("POST", `/admin/businesses/${id}/contacts`, parsed.data);
    }
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    return { ok: false, error: "No se pudo guardar el contacto." };
  }

  revalidateBusiness(id);
  return { ok: true };
}

export async function deleteContactAction(
  id: string,
  contactId: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await adminDelete(`/admin/businesses/${id}/contacts/${contactId}`);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo eliminar el contacto." };
  }

  revalidateBusiness(id);
  return { ok: true };
}

// — Acciones sobre citas (F7, soporte del operador) —

/**
 * Lee el formulario de `AppointmentActions`: `action` viene del botón pulsado,
 * `reason` del campo de cancelación y `balancePaid` del checkbox de saldo.
 * Lo comparte el portal (`app/portal/actions.ts`).
 */
export async function parseAppointmentActionForm(formData: FormData) {
  return appointmentActionSchema.safeParse({
    action: formData.get("action"),
    reason: formData.get("reason") ?? undefined,
    balancePaid: formData.get("balancePaid") === "on",
  });
}

export async function appointmentActionAdmin(
  id: string,
  appointmentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = await parseAppointmentActionForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Acción inválida." };
  }

  try {
    await adminMutate("POST", `/admin/businesses/${id}/appointments/${appointmentId}/actions`, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo actualizar la cita." };
  }

  revalidateBusiness(id);
  return { ok: true };
}

// — Catálogo: servicios y horarios (§6.1 pasos 3–4) —

export async function saveServiceAction(
  id: string,
  serviceId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = upsertServiceSchema.safeParse({
    ...Object.fromEntries(formData),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos.", fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  try {
    if (serviceId) {
      await adminMutate<ServiceDto>("PATCH", `/admin/businesses/${id}/services/${serviceId}`, parsed.data);
    } else {
      await adminMutate<ServiceDto>("POST", `/admin/businesses/${id}/services`, parsed.data);
    }
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    return { ok: false, error: "No se pudo guardar el servicio." };
  }

  revalidateBusiness(id);
  return { ok: true };
}

/** Pausar / reactivar sin abrir el formulario. */
export async function setServiceActiveAction(
  id: string,
  serviceId: string,
  active: boolean,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  const body = updateServiceSchema.parse({ active });
  try {
    await adminMutate<ServiceDto>("PATCH", `/admin/businesses/${id}/services/${serviceId}`, body);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo actualizar el servicio." };
  }

  revalidateBusiness(id);
  return { ok: true };
}

export async function deleteServiceAction(
  id: string,
  serviceId: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await adminDelete(`/admin/businesses/${id}/services/${serviceId}`);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo eliminar el servicio." };
  }

  revalidateBusiness(id);
  return { ok: true };
}

/**
 * La semana completa en un solo envío. Los campos del formulario son
 * `day-<n>-active|open|close` (n = 0 domingo … 6 sábado); los errores se
 * devuelven por día (`day-<n>`) porque `zodToFieldErrors` solo mira la última
 * parte del path y todos los días se llaman igual.
 */
export async function saveBusinessHoursAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    active: formData.get(`day-${dayOfWeek}-active`) === "on",
    openTime: String(formData.get(`day-${dayOfWeek}-open`) ?? ""),
    closeTime: String(formData.get(`day-${dayOfWeek}-close`) ?? ""),
  }));

  const parsed = updateBusinessHoursSchema.safeParse({ days });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const index = issue.path[1];
      const key = typeof index === "number" ? `day-${days[index]!.dayOfWeek}` : "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, error: "Revisa los horarios marcados.", fieldErrors };
  }

  try {
    await adminMutate<BusinessHourDto[]>("PUT", `/admin/businesses/${id}/hours`, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudieron guardar los horarios." };
  }

  revalidateBusiness(id);
  return { ok: true, message: "Horarios guardados." };
}

// — Usuarios del portal del cliente (F7) —

export async function createBusinessUserAction(
  id: string,
  _prev: UserCredentialsState,
  formData: FormData,
): Promise<UserCredentialsState> {
  const parsed = createBusinessUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos.", fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  let result: BusinessUserCredentials;
  try {
    result = await adminMutate<BusinessUserCredentials>("POST", `/admin/businesses/${id}/users`, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    return { ok: false, error: "No se pudo crear el usuario." };
  }

  revalidateBusiness(id);
  return { ok: true, email: result.user.email, temporaryPassword: result.temporaryPassword };
}

export async function resetBusinessUserPasswordAction(
  id: string,
  userId: string,
  _prev: UserCredentialsState,
  _formData: FormData,
): Promise<UserCredentialsState> {
  let result: BusinessUserCredentials;
  try {
    result = await adminMutate<BusinessUserCredentials>(
      "POST",
      `/admin/businesses/${id}/users/${userId}/reset-password`,
      {},
    );
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo restablecer la contraseña." };
  }

  return { ok: true, email: result.user.email, temporaryPassword: result.temporaryPassword };
}

export async function resetBusinessUserTwoFactorAction(
  id: string,
  userId: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await adminMutate<BusinessUserDto>("POST", `/admin/businesses/${id}/users/${userId}/reset-2fa`, {});
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo quitar la verificación en dos pasos." };
  }

  revalidateBusiness(id);
  return { ok: true, message: "Verificación en dos pasos quitada y sesiones cerradas." };
}

export async function updateBusinessUserRoleAction(
  id: string,
  userId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = updateBusinessUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Rol inválido." };
  }

  try {
    await adminMutate<BusinessUserDto>("PATCH", `/admin/businesses/${id}/users/${userId}`, parsed.data);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo cambiar el rol." };
  }

  revalidateBusiness(id);
  return { ok: true };
}

export async function removeBusinessUserAction(
  id: string,
  userId: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await adminDelete(`/admin/businesses/${id}/users/${userId}`);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo quitar el usuario." };
  }

  revalidateBusiness(id);
  return { ok: true };
}
