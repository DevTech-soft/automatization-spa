"use client";

import { useActionState, useState } from "react";
import { availableAppointmentActions, type AppointmentAction } from "@spa/shared";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/form-field";
import type { FormState } from "@/app/(app)/businesses/actions";

/**
 * Botones de la recepción sobre una cita (F7): atendida, no asistió, cancelar y
 * deshacer. Qué botones salen lo decide `availableAppointmentActions` (estado +
 * fecha); el backend revalida igual. "Atendida" y "No asistió" van de un clic
 * porque se pueden deshacer; cancelar pide motivo, que hace de confirmación.
 */

export type AppointmentActionRunner = (
  appointmentId: string,
  prev: FormState,
  formData: FormData,
) => Promise<FormState>;

const LABEL: Record<AppointmentAction, string> = {
  complete: "Atendida",
  no_show: "No asistió",
  cancel: "Cancelar",
  reopen: "Deshacer",
};

export function AppointmentActions({
  appointment,
  today,
  run,
}: {
  appointment: { id: string; status: string; date: string; pendingBalance: number | null };
  today: string;
  run: AppointmentActionRunner;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(run.bind(null, appointment.id), { ok: false });
  const [cancelling, setCancelling] = useState(false);
  const actions = availableAppointmentActions(appointment.status, appointment.date, today);
  const hasBalance = (appointment.pendingBalance ?? 0) > 0;

  // Tras cancelar ya no quedan acciones, pero el resultado del aviso a la
  // clienta tiene que seguir a la vista (sobre todo si no salió).
  const feedback = state.warning ? (
    <p className="w-full rounded-md bg-[var(--color-warning-soft)] px-2 py-1 text-xs text-[var(--color-warning)]" role="status">
      {state.warning}
    </p>
  ) : state.message ? (
    <p className="w-full text-xs text-[var(--color-success)]" role="status">
      {state.message}
    </p>
  ) : null;

  if (actions.length === 0) return feedback;

  if (cancelling) {
    return (
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="action" value="cancel" />
        <input
          name="reason"
          required
          minLength={3}
          maxLength={300}
          autoFocus
          placeholder="Motivo de la cancelación"
          aria-label="Motivo de la cancelación"
          className="h-8 min-w-48 flex-1 rounded-[var(--radius)] border border-[var(--color-input)] bg-[var(--color-background)] px-2 text-sm outline-none focus-visible:border-[var(--color-ring)]"
        />
        <SubmitButton size="sm" variant="outline" label="Confirmar" pendingLabel="…" />
        <Button type="button" size="sm" variant="ghost" onClick={() => setCancelling(false)}>
          Volver
        </Button>
        <label className="flex w-full items-center gap-1.5 text-xs text-[var(--color-fg-muted)]">
          <input type="checkbox" name="notifyCustomer" defaultChecked className="size-3.5" />
          Avisar a la clienta por WhatsApp (el motivo no se le envía)
        </label>
        {state.error ? <p className="w-full text-xs text-[var(--color-danger)]">{state.error}</p> : null}
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      {actions.includes("complete") && hasBalance ? (
        <label className="mr-1 flex items-center gap-1 text-xs text-[var(--color-fg-muted)]">
          <input type="checkbox" name="balancePaid" defaultChecked className="size-3.5" />
          saldo cobrado
        </label>
      ) : null}
      {actions
        .filter((action) => action !== "cancel")
        .map((action) => (
          <SubmitButton
            key={action}
            name="action"
            value={action}
            size="sm"
            variant={action === "complete" ? "outline" : "ghost"}
            label={LABEL[action]}
            pendingLabel="…"
          />
        ))}
      {actions.includes("cancel") ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => setCancelling(true)}>
          {LABEL.cancel}
        </Button>
      ) : null}
      {state.error ? <p className="w-full text-xs text-[var(--color-danger)]">{state.error}</p> : null}
      {feedback}
    </form>
  );
}
