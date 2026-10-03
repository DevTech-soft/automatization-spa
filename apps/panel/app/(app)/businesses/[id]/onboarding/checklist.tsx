"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, CircleDashed } from "lucide-react";
import type { OnboardingChecklist, OnboardingStep, OnboardingStepKey } from "@spa/shared";
import { buttonVariants } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/card";
import { FormAlert, SubmitButton } from "@/components/ui/form-field";
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
  services: { href: "/catalog", label: "Cargar servicios" },
  schedule: { href: "/catalog", label: "Definir horarios" },
  whatsapp: { href: "/integrations", label: "Conectar" },
  whatsappProfile: { href: "/integrations", label: "Ver número" },
  payment: { href: "/integrations", label: "Cargar llaves" },
  plan: { href: "/subscription", label: "Definir plan" },
};

const STEP_NOTE: Partial<Record<OnboardingStepKey, string>> = {
  services: "Lo que el bot, el agente y la web ofrecen para reservar.",
  schedule: "Sin horario activo un día, ese día no se ofrecen citas.",
  whatsapp: "Alta manual del número mientras Meta aprueba el Embedded Signup.",
  payment: "Sin llaves propias el negocio cobra con las del operador.",
  googleSheet: "Opcional: `settings.googleSheetId`.",
  plan: "Plan y vigencia del cobro al cliente.",
};

function StepIcon({ step }: { step: OnboardingStep }) {
  if (step.done) return <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--color-success)]" />;
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
      <SubmitButton
        label="Activar negocio"
        pendingLabel="Activando…"
        disabled={!checklist.canActivate}
        className="w-full"
      />
      {!checklist.canActivate ? (
        <p className="text-center text-xs text-[var(--color-fg-muted)]">Faltan pasos requeridos.</p>
      ) : null}
      {state.error ? <FormAlert state={state} /> : null}
    </form>
  );
}

export function OnboardingChecklistView({ checklist }: { checklist: OnboardingChecklist }) {
  const required = checklist.steps.filter((s) => s.required);
  const doneCount = required.filter((s) => s.done).length;
  const percent = required.length === 0 ? 100 : Math.round((doneCount / required.length) * 100);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <SectionCard
        className="lg:col-span-2"
        title="Checklist de alta"
        description="Los pasos se calculan solos a partir de lo cargado; los manuales se marcan aquí."
        flush
      >
        <ul className="flex flex-col divide-y divide-[var(--color-border)]">
          {checklist.steps.map((step) => {
            const link = STEP_LINK[step.key];
            return (
              <li key={step.key} className="flex gap-3 px-6 py-4">
                <StepIcon step={step} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-sm font-medium", step.done && "text-[var(--color-fg-muted)]")}>
                      {step.label}
                    </span>
                    {!step.required ? <Tag>opcional</Tag> : null}
                    {step.manual ? <Tag>manual</Tag> : null}
                  </div>
                  <p className="text-sm text-[var(--color-fg-muted)]">{step.detail}</p>
                  {!step.done && STEP_NOTE[step.key] ? (
                    <p className="text-xs text-[var(--color-fg-muted)]">{STEP_NOTE[step.key]}</p>
                  ) : null}
                  {step.manual ? <ManualToggle businessId={checklist.businessId} step={step} /> : null}
                </div>
                {link && !step.done ? (
                  <Link
                    href={`/businesses/${checklist.businessId}${link.href}`}
                    className={cn(buttonVariants({ variant: "soft", size: "sm" }), "shrink-0")}
                  >
                    {link.label}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard title="Activación" description="Pasa el negocio de prueba a activo." contentClassName="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold tracking-tight">{percent}%</span>
            <span className="text-sm text-[var(--color-fg-muted)]">
              {doneCount} de {required.length} requeridos
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-grid)]"
            role="progressbar"
            aria-label="Pasos requeridos completados"
            aria-valuenow={doneCount}
            aria-valuemin={0}
            aria-valuemax={required.length}
          >
            <div
              className={cn(
                "h-full rounded-full transition-all",
                checklist.canActivate ? "bg-[var(--color-success)]" : "bg-[var(--color-primary)]",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <p className="text-sm text-[var(--color-fg-muted)]">
          El backend vuelve a verificar el checklist antes de aceptar la activación.
        </p>
        <ActivatePanel checklist={checklist} />
      </SectionCard>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-[var(--color-grid)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-fg-muted)]">
      {children}
    </span>
  );
}
