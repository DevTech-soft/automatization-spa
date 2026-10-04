"use client";

import { useActionState, useState } from "react";
import { Clock, Plus, Sparkles, Users } from "lucide-react";
import type { ServiceDto } from "@spa/shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/card";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form-field";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  deleteServiceAction,
  saveServiceAction,
  setServiceActiveAction,
  type FormState,
} from "../../actions";

/**
 * Servicios del negocio. Edición en línea (uno abierto a la vez), como
 * Contactos. Un servicio con citas no se borra: se pausa, y deja de ofrecerse
 * en el bot, el agente y la web sin romper el historial.
 */
export function ServicesList({
  businessId,
  services,
  currency,
}: {
  businessId: string | null;
  services: ServiceDto[];
  currency: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <SectionCard
      title="Servicios"
      description="Lo que el bot, el agente y la página de reservas ofrecen. Cambiar el precio no afecta las citas ya agendadas."
      actions={
        !adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Nuevo servicio
          </Button>
        ) : null
      }
      flush
    >
      {adding ? (
        <div className="border-b border-[var(--color-border)] p-4">
          <ServiceForm businessId={businessId} service={null} onDone={() => setAdding(false)} />
        </div>
      ) : null}

      {services.length === 0 && !adding ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-[var(--color-fg-muted)]">
          <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <Sparkles className="size-5" />
          </span>
          Sin servicios. El negocio no puede recibir reservas hasta cargar al menos uno.
        </div>
      ) : null}

      <ul className="flex flex-col divide-y divide-[var(--color-border)]">
        {services.map((service) =>
          editing === service.id ? (
            <li key={service.id} className="p-4">
              <ServiceForm businessId={businessId} service={service} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li
              key={service.id}
              className={cn(
                "flex flex-wrap items-start justify-between gap-3 px-6 py-4 hover:bg-[var(--color-surface)]",
                !service.active && "opacity-60",
              )}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {service.name}
                  {!service.active ? (
                    <span className="rounded-md bg-[var(--color-grid)] px-2 py-0.5 text-xs font-medium text-[var(--color-fg-muted)]">
                      Pausado
                    </span>
                  ) : null}
                </p>
                <div className="flex flex-wrap gap-4 text-sm text-[var(--color-fg-muted)]">
                  <span className="font-medium text-[var(--color-fg)]">{formatMoney(service.price, currency)}</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {service.durationMinutes} min
                  </span>
                  {service.capacity > 1 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-3.5" />
                      {service.capacity} a la vez
                    </span>
                  ) : null}
                  {service.appointmentsCount > 0 ? <span>{service.appointmentsCount} cita(s)</span> : null}
                </div>
                {service.description ? (
                  <p className="whitespace-pre-line text-sm text-[var(--color-fg-muted)]">{service.description}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(service.id)}>
                  Editar
                </Button>
                <ToggleButton businessId={businessId} service={service} />
                {service.appointmentsCount === 0 ? (
                  <DeleteButton businessId={businessId} serviceId={service.id} />
                ) : null}
              </div>
            </li>
          ),
        )}
      </ul>
    </SectionCard>
  );
}

function ServiceForm({
  businessId,
  service,
  onDone,
}: {
  businessId: string | null;
  service: ServiceDto | null;
  onDone: () => void;
}) {
  const action = saveServiceAction.bind(null, businessId, service?.id ?? null);
  const [state, formAction] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.ok) onDone();
    return result;
  }, { ok: false });

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-surface)] p-4"
    >
      <p className="text-sm font-medium">{service ? `Editar ${service.name}` : "Nuevo servicio"}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Nombre" errors={state.fieldErrors}>
          <Input id="name" name="name" defaultValue={service?.name ?? ""} required />
        </Field>
        <Field name="price" label="Precio" errors={state.fieldErrors}>
          <Input
            id="price"
            name="price"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            defaultValue={service?.price ?? ""}
            required
          />
        </Field>
        <Field name="durationMinutes" label="Duración (minutos)" errors={state.fieldErrors}>
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={5}
            max={720}
            step={5}
            defaultValue={service?.durationMinutes ?? 60}
            required
          />
        </Field>
        <Field
          name="capacity"
          label="Citas simultáneas"
          errors={state.fieldErrors}
          hint="Cuántas personas se atienden a la misma hora (sillas, cabinas)."
        >
          <Input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            max={50}
            defaultValue={service?.capacity ?? 1}
            required
          />
        </Field>
      </div>
      <Field name="description" label="Descripción" errors={state.fieldErrors}>
        <Textarea id="description" name="description" rows={2} defaultValue={service?.description ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={service?.active ?? true} className="size-4" />
        Se ofrece a las clientas
      </label>

      <FormAlert state={state} />
      <div className="flex gap-2">
        <SubmitButton label={service ? "Guardar" : "Crear servicio"} />
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function ToggleButton({ businessId, service }: { businessId: string | null; service: ServiceDto }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    setServiceActiveAction.bind(null, businessId, service.id, !service.active),
    { ok: false },
  );

  return (
    <form action={formAction}>
      <SubmitButton
        variant="ghost"
        size="sm"
        label={service.active ? "Pausar" : "Reactivar"}
        pendingLabel="…"
      />
      {state.error ? <span className="text-xs text-[var(--color-danger)]">{state.error}</span> : null}
    </form>
  );
}

function DeleteButton({ businessId, serviceId }: { businessId: string | null; serviceId: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    deleteServiceAction.bind(null, businessId, serviceId),
    { ok: false },
  );

  return (
    <form action={formAction}>
      <SubmitButton variant="ghost" size="sm" label="Eliminar" pendingLabel="…" aria-label="Eliminar servicio" />
      {state.error ? <span className="text-xs text-[var(--color-danger)]">{state.error}</span> : null}
    </form>
  );
}
