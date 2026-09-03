import { z } from "zod";
import type { BusinessStatus } from "./business.js";

/**
 * Checklist de onboarding por negocio (docs/PANEL-OPERADOR.md §6.1). El negocio
 * nace en `TRIAL` y solo pasa a `ACTIVE` cuando todos los pasos **requeridos**
 * están hechos.
 *
 * El backend deriva `done` de la data real (servicios, horarios, credenciales…)
 * salvo en los pasos `manual`, que el panel no puede verificar (aprobación de
 * Meta) y el operador marca a mano — se guardan en `settings.onboarding`.
 */

export const onboardingStepKeys = [
  "basics",
  "branding",
  "services",
  "schedule",
  "whatsapp",
  "whatsappProfile",
  "payment",
  "googleSheet",
  "plan",
] as const;

export type OnboardingStepKey = (typeof onboardingStepKeys)[number];

export interface OnboardingStep {
  key: OnboardingStepKey;
  label: string;
  /** Qué falta / qué se verificó. Se muestra bajo el título del paso. */
  detail: string;
  done: boolean;
  /** Un paso no requerido no bloquea la activación (§6.1 paso 7, Google Sheet). */
  required: boolean;
  /** Lo marca el operador; el panel no puede derivarlo de la data. */
  manual: boolean;
}

/** Respuesta de `GET /admin/businesses/:id/onboarding`. */
export interface OnboardingChecklist {
  businessId: string;
  status: BusinessStatus;
  steps: OnboardingStep[];
  /** Todos los pasos requeridos están hechos. */
  complete: boolean;
  /** `complete` y el negocio todavía no está `ACTIVE`. */
  canActivate: boolean;
}

/**
 * Marcas manuales del checklist (`PATCH /admin/businesses/:id/onboarding`).
 * Se persisten en `business.settings.onboarding`.
 */
export const onboardingManualSchema = z
  .object({
    /** Meta aprobó el nombre visible y la foto de perfil del número (§6.1 paso 5). */
    whatsappProfileApproved: z.boolean(),
  })
  .partial();

export type OnboardingManualInput = z.infer<typeof onboardingManualSchema>;
