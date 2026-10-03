"use client";

import { useActionState, useState } from "react";
import { Bot, ImageOff } from "lucide-react";
import type { AgentSettings, BusinessBranding } from "@spa/shared";
import { Card, SectionCard } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form-field";
import { updateBrandingAction, type FormState } from "../../actions";

/** Etiqueta y tipo de control de cada campo de la persona del agente. */
const AGENT_FIELDS: { key: keyof AgentSettings; label: string; long?: boolean; hint?: string }[] = [
  { key: "nombreAgente", label: "Nombre del agente", hint: "Con quién cree hablar la clienta." },
  { key: "tipoNegocio", label: "Tipo de negocio", hint: "Spa, salón de uñas, barbería…" },
  { key: "ciudad", label: "Ciudad" },
  { key: "nombreEncargada", label: "Encargada / contacto humano" },
  { key: "horarioTexto", label: "Horario (en palabras)", long: true },
  { key: "sedesTexto", label: "Sedes y direcciones", long: true },
  { key: "politicaAbono", label: "Política de abono", long: true },
  { key: "politicaCancelacion", label: "Política de cancelación", long: true },
  { key: "metodosPago", label: "Métodos de pago", long: true },
];

const HEX = /^#[0-9a-f]{6}$/i;

function ColorField({
  name,
  label,
  value,
  onChange,
  errors,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors?: Record<string, string[]>;
}) {
  // Dos controles sobre un solo valor: el selector nativo para elegir y el
  // texto para pegar un hex de la guía de marca del cliente.
  return (
    <Field name={name} label={label} errors={errors} hint="Formato hex, ej. #4f46e5.">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (selector)`}
          value={HEX.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-[var(--radius)] border border-[var(--color-input)] bg-transparent p-1"
        />
        <Input id={name} name={name} value={value} placeholder="#4f46e5" onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  );
}

/**
 * Vista previa de cómo se ve la marca en la web de reservas y las gift cards.
 * No es la página real: solo junta logo y colores para detectar a ojo un hex
 * mal copiado antes de guardar.
 */
function BrandPreview({ logoUrl, primary, secondary }: { logoUrl: string; primary: string; secondary: string }) {
  const p = HEX.test(primary) ? primary : "var(--color-primary)";
  const s = HEX.test(secondary) ? secondary : "var(--color-primary-soft)";
  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)]">
      <div className="flex h-20 items-center justify-center" style={{ background: s }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="max-h-14 max-w-[70%] object-contain" />
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)]">
            <ImageOff className="size-4" /> Sin logo
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 bg-[var(--color-background)] p-3">
        <span className="text-xs text-[var(--color-fg-muted)]">Vista previa</span>
        <span className="rounded-md px-3 py-1.5 text-xs font-medium text-white" style={{ background: p }}>
          Reservar
        </span>
      </div>
    </div>
  );
}

export function BrandingForm({ branding }: { branding: BusinessBranding }) {
  const action = updateBrandingAction.bind(null, branding.businessId);
  const [state, formAction] = useActionState<FormState, FormData>(action, { ok: false });
  const errors = state.fieldErrors;

  const [logoUrl, setLogoUrl] = useState(branding.logoUrl ?? "");
  const [primary, setPrimary] = useState(branding.colorPrimary ?? "");
  const [secondary, setSecondary] = useState(branding.colorSecondary ?? "");

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <FormAlert state={state} />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <SectionCard
          title="Identidad"
          description="Logo y colores. Se usan en la web de reservas y en las gift cards."
          contentClassName="flex flex-col gap-5"
        >
          <BrandPreview logoUrl={logoUrl} primary={primary} secondary={secondary} />
          <Field
            name="logoUrl"
            label="URL del logo"
            errors={errors}
            hint="Enlace público a la imagen (https). Todavía no hay carga de archivos."
          >
            <Input
              id="logoUrl"
              name="logoUrl"
              type="url"
              placeholder="https://…/logo.png"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
            />
          </Field>
          <ColorField name="colorPrimary" label="Color primario" value={primary} onChange={setPrimary} errors={errors} />
          <ColorField
            name="colorSecondary"
            label="Color secundario"
            value={secondary}
            onChange={setSecondary}
            errors={errors}
          />
        </SectionCard>

        <SectionCard
          className="lg:col-span-2"
          title="Persona del agente"
          description="Contexto que viaja a n8n en cada mensaje. Con el bot de menús estos campos se ignoran."
          contentClassName="flex flex-col gap-5"
        >
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <input
              type="checkbox"
              name="agentEnabled"
              defaultChecked={branding.agentEnabled}
              className="mt-0.5 size-4"
            />
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Bot className="size-4 text-[var(--color-primary)]" />
                Usar el agente conversacional de n8n en WhatsApp
              </span>
              <span className="text-xs text-[var(--color-fg-muted)]">
                Apagado, el negocio responde con el bot de menús.
              </span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            {AGENT_FIELDS.map(({ key, label, long, hint }) => (
              <div key={key} className={long ? "sm:col-span-2" : undefined}>
                <Field name={key} label={label} errors={errors} hint={hint}>
                  {long ? (
                    <Textarea id={key} name={key} rows={2} defaultValue={branding.agent[key] ?? ""} />
                  ) : (
                    <Input id={key} name={key} defaultValue={branding.agent[key] ?? ""} />
                  )}
                </Field>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <Card className="sticky bottom-4 flex items-center justify-between gap-3 px-6 py-3">
        <span className="text-sm text-[var(--color-fg-muted)]">Identidad y persona se guardan juntas.</span>
        <SubmitButton label="Guardar marca" />
      </Card>
    </form>
  );
}
