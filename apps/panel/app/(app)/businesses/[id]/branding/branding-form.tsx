"use client";

import { useActionState, useState } from "react";
import type { AgentSettings, BusinessBranding } from "@spa/shared";
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

function ColorField({
  name,
  label,
  defaultValue,
  errors,
}: {
  name: string;
  label: string;
  defaultValue: string;
  errors?: Record<string, string[]>;
}) {
  // Dos controles sobre un solo valor: el selector nativo para elegir y el
  // texto para pegar un hex de la guía de marca del cliente.
  const [value, setValue] = useState(defaultValue);
  return (
    <Field name={name} label={label} errors={errors} hint="Formato hex, ej. #4f46e5.">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (selector)`}
          value={value || "#000000"}
          onChange={(e) => setValue(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-[var(--radius)] border border-[var(--color-input)] bg-transparent p-1"
        />
        <Input
          id={name}
          name={name}
          value={value}
          placeholder="#4f46e5"
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
    </Field>
  );
}

export function BrandingForm({ branding }: { branding: BusinessBranding }) {
  const action = updateBrandingAction.bind(null, branding.businessId);
  const [state, formAction] = useActionState<FormState, FormData>(action, { ok: false });
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <FormAlert state={state} />

      <section className="flex flex-col gap-5">
        <div>
          <h2 className="text-base font-semibold">Identidad</h2>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Logo y colores del negocio. Se usan en el formulario web y en las gift cards.
          </p>
        </div>

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
            defaultValue={branding.logoUrl ?? ""}
          />
        </Field>

        {branding.logoUrl ? (
          <div className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--color-border)] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={branding.logoUrl}
              alt={`Logo actual`}
              className="size-14 rounded object-contain"
            />
            <span className="text-xs text-[var(--color-fg-muted)]">Logo guardado.</span>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            name="colorPrimary"
            label="Color primario"
            defaultValue={branding.colorPrimary ?? ""}
            errors={errors}
          />
          <ColorField
            name="colorSecondary"
            label="Color secundario"
            defaultValue={branding.colorSecondary ?? ""}
            errors={errors}
          />
        </div>
      </section>

      <section className="flex flex-col gap-5 border-t border-[var(--color-border)] pt-6">
        <div>
          <h2 className="text-base font-semibold">Persona del agente</h2>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Contexto que viaja a n8n en cada mensaje. Solo aplica si el agente está activo; con el
            bot de menús estos campos se ignoran.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="agentEnabled"
            defaultChecked={branding.agentEnabled}
            className="size-4"
          />
          Usar el agente conversacional de n8n en WhatsApp
        </label>

        {AGENT_FIELDS.map(({ key, label, long, hint }) => (
          <Field key={key} name={key} label={label} errors={errors} hint={hint}>
            {long ? (
              <Textarea id={key} name={key} rows={2} defaultValue={branding.agent[key] ?? ""} />
            ) : (
              <Input id={key} name={key} defaultValue={branding.agent[key] ?? ""} />
            )}
          </Field>
        ))}
      </section>

      <div>
        <SubmitButton label="Guardar marca" />
      </div>
    </form>
  );
}
