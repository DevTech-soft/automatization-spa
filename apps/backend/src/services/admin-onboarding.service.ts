import type {
  OnboardingChecklist,
  OnboardingManualInput,
  OnboardingStep,
  OnboardingStepKey,
} from "@spa/shared";
import type { Prisma } from "@spa/db";
import {
  adminBusinessRepository,
  type AdminBusinessOnboardingRow,
  type OnboardingCounts,
} from "../repositories/adminBusiness.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import { NotFoundError, ValidationError } from "../errors/index.js";
import { logger } from "../utils/logger.js";
import { readAgent, readBusinessSettings } from "./business-settings.js";

/**
 * Checklist de onboarding (docs/PANEL-OPERADOR.md §6.1). El negocio nace en
 * `TRIAL` y solo el operador lo pasa a `ACTIVE`, y solo cuando todos los pasos
 * requeridos están hechos.
 *
 * Casi todos los pasos se **derivan** de la data (¿hay servicios? ¿hay
 * credenciales de Wompi?) en vez de guardarse como banderas: así el checklist no
 * se desincroniza si alguien borra una fila. Lo único persistido es lo que el
 * panel no puede verificar —la aprobación del perfil de WhatsApp por Meta—, que
 * vive en `settings.onboarding`.
 */

function step(
  key: OnboardingStepKey,
  label: string,
  done: boolean,
  detail: string,
  options: { required?: boolean; manual?: boolean } = {},
): OnboardingStep {
  return {
    key,
    label,
    detail,
    done,
    required: options.required ?? true,
    manual: options.manual ?? false,
  };
}

function buildSteps(row: AdminBusinessOnboardingRow, counts: OnboardingCounts): OnboardingStep[] {
  const settings = readBusinessSettings(row.settings);
  const agent = readAgent(row.settings);
  const agentEnabled = settings.agentEnabled === true;

  const hasContact = Boolean(row.phone || row.email || row.whatsappNumber);

  // La persona del agente solo hace falta si el negocio usa el agente de n8n;
  // con el bot de menús alcanza con el logo y los colores.
  const brandingDone =
    Boolean(row.logoUrl && row.colorPrimary && row.colorSecondary) &&
    (!agentEnabled || Boolean(agent.nombreAgente));

  const googleSheetId = typeof settings.googleSheetId === "string" ? settings.googleSheetId.trim() : "";

  return [
    step(
      "basics",
      "Datos básicos y contacto",
      hasContact,
      hasContact ? "Contacto del dueño registrado." : "Falta teléfono, WhatsApp o correo del dueño.",
    ),
    step(
      "branding",
      "Marca",
      brandingDone,
      brandingDone
        ? "Logo, colores" + (agentEnabled ? " y persona del agente." : ".")
        : agentEnabled
          ? "Faltan logo, colores o el nombre del agente."
          : "Faltan el logo o los colores.",
    ),
    step(
      "services",
      "Servicios",
      counts.services > 0,
      counts.services > 0 ? `${counts.services} servicio(s) activo(s).` : "Sin servicios activos.",
    ),
    step(
      "schedule",
      "Horarios de atención",
      counts.businessHours > 0,
      counts.businessHours > 0
        ? `${counts.businessHours} día(s) con horario activo.`
        : "Sin horarios de atención cargados.",
    ),
    step(
      "whatsapp",
      "Número de WhatsApp",
      counts.whatsAppAccounts > 0,
      counts.whatsAppAccounts > 0
        ? "Número conectado a la app."
        : "Sin número conectado. Lo conecta el cliente por Embedded Signup (F4).",
    ),
    step(
      "whatsappProfile",
      "Perfil de WhatsApp aprobado",
      settings.onboarding?.whatsappProfileApproved === true,
      "Meta aprueba el nombre visible y la foto. Márcalo cuando llegue la aprobación.",
      { manual: true },
    ),
    step(
      "payment",
      "Credenciales de Wompi",
      counts.paymentCredentials > 0,
      counts.paymentCredentials > 0
        ? "Llaves cargadas y cifradas."
        : "Sin llaves propias: los pagos caerían a las credenciales globales del operador.",
    ),
    step(
      "googleSheet",
      "Google Sheet (opcional)",
      googleSheetId.length > 0,
      googleSheetId.length > 0 ? "Hoja configurada." : "Sin hoja configurada. No bloquea la activación.",
      { required: false },
    ),
    step(
      "plan",
      "Plan de suscripción",
      counts.subscriptionPlans > 0,
      counts.subscriptionPlans > 0 ? "Plan con fecha de vencimiento." : "Falta definir el plan y su vigencia.",
    ),
  ];
}

function toChecklist(row: AdminBusinessOnboardingRow, counts: OnboardingCounts): OnboardingChecklist {
  const steps = buildSteps(row, counts);
  const complete = steps.every((s) => !s.required || s.done);
  return {
    businessId: row.id,
    status: row.status,
    steps,
    complete,
    // Solo se activa desde `TRIAL`. Reactivar un `SUSPENDED` es otra cosa: va
    // atado al pago de la cuenta de cobro (§6.4, F5).
    canActivate: complete && row.status === "TRIAL",
  };
}

async function loadChecklist(businessId: string): Promise<OnboardingChecklist> {
  const row = await adminBusinessRepository.findOnboarding(businessId);
  if (!row) {
    throw new NotFoundError("Negocio no encontrado.");
  }
  const counts = await adminBusinessRepository.countOnboardingEntities(businessId);
  return toChecklist(row, counts);
}

export function getOnboardingChecklist(businessId: string): Promise<OnboardingChecklist> {
  return loadChecklist(businessId);
}

/** Marca (o desmarca) los pasos que el operador confirma a mano. */
export async function updateOnboardingManual(
  businessId: string,
  input: OnboardingManualInput,
  actor: string,
): Promise<OnboardingChecklist> {
  const row = await adminBusinessRepository.findOnboarding(businessId);
  if (!row) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  const settings = readBusinessSettings(row.settings);
  const onboarding = { ...(settings.onboarding ?? {}) };
  if (input.whatsappProfileApproved !== undefined) {
    onboarding.whatsappProfileApproved = input.whatsappProfileApproved;
  }

  await adminBusinessRepository.updateBranding(businessId, {
    settings: { ...settings, onboarding } as unknown as Prisma.InputJsonValue,
  });

  await auditLogRepository.record({
    actor,
    action: "business.onboarding.update",
    businessId,
    before: (settings.onboarding ?? {}) as Prisma.InputJsonValue,
    after: onboarding as Prisma.InputJsonValue,
  });
  logger.info({ actor, businessId }, "admin_business_onboarding_updated");

  return loadChecklist(businessId);
}

/**
 * Paso 9 del onboarding: `TRIAL` → `ACTIVE`. Se revalida el checklist en el
 * servidor — el botón deshabilitado del panel es comodidad, no seguridad.
 */
export async function activateBusiness(businessId: string, actor: string): Promise<OnboardingChecklist> {
  const checklist = await loadChecklist(businessId);

  if (checklist.status === "ACTIVE") {
    throw new ValidationError("El negocio ya está activo.");
  }
  if (checklist.status !== "TRIAL") {
    throw new ValidationError(
      "Solo se activa desde el estado de prueba. Para reactivar un negocio suspendido, registra el pago.",
    );
  }
  if (!checklist.complete) {
    const missing = checklist.steps.filter((s) => s.required && !s.done).map((s) => s.label);
    throw new ValidationError(`Faltan pasos del onboarding: ${missing.join(", ")}.`);
  }

  await adminBusinessRepository.update(businessId, { status: "ACTIVE" });

  await auditLogRepository.record({
    actor,
    action: "business.activate",
    businessId,
    before: { status: "TRIAL" },
    after: { status: "ACTIVE" },
  });
  logger.info({ actor, businessId }, "admin_business_activated");

  return loadChecklist(businessId);
}
