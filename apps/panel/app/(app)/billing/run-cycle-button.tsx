"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/form-field";
import { runBillingCycleAction } from "./actions";
import type { FormState } from "../businesses/actions";

/**
 * Dispara a mano el ciclo que el cron corre a diario (docs/PANEL-OPERADOR.md
 * §6.4). Es idempotente, así que darle dos veces no duplica cuentas; sirve para
 * ver el efecto sin esperar a las 6 a.m.
 */
export function RunCycleButton() {
  const [state, formAction] = useActionState<FormState, FormData>(runBillingCycleAction, { ok: false });

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <SubmitButton
        variant="outline"
        size="sm"
        label="Correr facturación"
        pendingLabel="Corriendo…"
      />
      {state.error ? (
        <span className="text-xs text-[var(--color-danger)]">{state.error}</span>
      ) : state.ok ? (
        <span className="max-w-xs text-right text-xs text-[var(--color-fg-muted)]">{state.message}</span>
      ) : null}
    </form>
  );
}
