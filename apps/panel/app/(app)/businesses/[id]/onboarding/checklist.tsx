"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, CircleDashed } from "lucide-react";
import type { OnboardingChecklist, OnboardingStep, OnboardingStepKey } from "@spa/shared";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { activateBusinessAction, setOnboardingFlagAction, type FormState } from "../../actions";

/**
 * Checklist de onboarding (docs/PANEL-OPERADOR.md §6.1). Los pasos se derivan en
 * el backend; aquí solo se pintan, se marcan los manuales y se activa el negocio.
 */

/** Dónde se resuelve cada paso desde el panel. Los que aún no tienen pantalla
 * propia muestran solo la pista de dónde se cargan. */
const STEP_LINK: Partial<Record<OnboardingStepKey, { href: string; label: string }>> = {
  basics: { href: "", label: "Ir a Datos" },
  branding: { href: "/branding", label: "Ir a Marca" },
};

const STEP_NOTE: Partial<Record<OnboardingStepKey, string>> = {
  services: "Se cargan por la API de servicios del backend; el editor llega después.",
  schedule: "Horarios de atención del negocio en la base de datos.",
  whatsapp: "Se conecta con Embedded Signup (F4). Puente manual mientras Meta aprueba.",
  payment: "Llaves de Wompi del negocio, cifradas (F2).",
  googleSheet: "Opcional: `settings.googleSheetId`.",
  plan: "Plan y vigencia del cobro al cliente (F5).",
};

function StepIcon({ step }: { step: OnboardingStep }) {
  if (step.done) return <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />;
  if (!step.required) return <CircleDashed className="mt-0.5 size-5 shrink-0 text-[var(--color-fg-muted)]" />;
  return <Circle className="mt-0.5 size-5 shrink-0 text-[var(--color-fg-muted)]" />;
}

function ManualToggle({ businessId, step }: { businessId: string; step: OnboardingStep }) {
  const action = setOnboardingFlagAction.bind(null, businessId);
  const [state, formAction] = useActionState<FormState, FormData>(action, { ok: false });

  return (
    <form action={formAction} className="mt-2 flex items-center gap-3">
      <input type="hidden" name="whatsappProfileApproved" value={step.done ? "false" : "true"} />
      <SubmitButton
        variant="outline"
        size="sm"
        label={step.done ? "Desmarcar" : "Marcar como hecho"}
        pendingLabel="…"
      />
      {state.error ? <span className="text-xs text-[var(--color-danger)]">{state.error}</span> : null}
    </form>
  );
}

function ActivatePanel({ checklist }: { checklist: OnboardingChecklist }) {
  const action = activateBusinessAction.bind(null, checklist.businessId);
  const [state, formAction] = useActionState<FormState, FormData>(action, { ok: false });

  if (checklist.status !== "TRIAL") {
    return (
      <p className="text-sm text-[var(--color-fg-muted)]">
        El negocio ya salió del estado de prueba. El estado se cambia a mano en la pestaña Datos, o
        automáticamente por la cartera (F5).
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <SubmitButton
          label="Activar negocio"
          pendingLabel="Activando…"
          disabled={!checklist.canActivate}
        />
        {!checklist.canActivate ? (
          <span className="text-sm text-[var(--color-fg-muted)]">
            Faltan pasos requeridos.
          </span>
        ) : null}
      </div>
      {state.error ? <p className="text-sm text-[var(--color-danger)]">{state.error}</p> : null}
    </form>
  );
}

export function OnboardingChecklistView({ checklist }: { checklist: OnboardingChecklist }) {
  const required = checklist.steps.filter((s) => s.required);
  const doneCount = required.filter((s) => s.done).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Checklist de alta</h2>
          <span className="text-sm text-[var(--color-fg-muted)]">
            {doneCount} de {required.length} pasos requeridos
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]"
          role="progressbar"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={required.length}
        >
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-all"
            style={{ width: `${(doneCount / required.length) * 100}%` }}
          />
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)]">
        {checklist.steps.map((step) => {
          const link = STEP_LINK[step.key];
          return (
            <li key={step.key} className="flex gap-3 p-4">
              <StepIcon step={step} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{step.label}</span>
                  {!step.required ? (
                    <span className="text-xs text-[var(--color-fg-muted)]">opcional</span>
                  ) : null}
                  {step.manual ? (
                    <span className="text-xs text-[var(--color-fg-muted)]">manual</span>
                  ) : null}
                </div>
                <p className="text-sm text-[var(--color-fg-muted)]">{step.detail}</p>
                {!step.done && STEP_NOTE[step.key] ? (
                  <p className="text-xs text-[var(--color-fg-muted)]">{STEP_NOTE[step.key]}</p>
                ) : null}
                {step.manual ? <ManualToggle businessId={checklist.businessId} step={step} /> : null}
              </div>
              {link ? (
                <Link
                  href={`/businesses/${checklist.businessId}${link.href}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
                >
                  {link.label}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-6">
        <h2 className="text-base font-semibold">Activación</h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Pasa el negocio de <strong>prueba</strong> a <strong>activo</strong>. El backend vuelve a
          verificar el checklist antes de aceptarlo.
        </p>
        <ActivatePanel checklist={checklist} />
      </div>
    </div>
  );
}
