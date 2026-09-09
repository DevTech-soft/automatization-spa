"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/form-field";
import { createInvoiceAction } from "../../../billing/actions";
import type { FormState } from "../../actions";

/**
 * Emite a mano la cuenta del próximo período. El job diario la emite sola 5
 * días antes del vencimiento (docs/PANEL-OPERADOR.md §6.4); esto es para
 * adelantarse o para reponer una que se anuló.
 */
export function EmitInvoiceButton({ businessId }: { businessId: string }) {
  const action = createInvoiceAction.bind(null, businessId);
  const [state, formAction] = useActionState<FormState, FormData>(action, { ok: false });

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
        <input type="checkbox" name="send" defaultChecked className="size-4" />
        marcarla como enviada
      </label>
      <SubmitButton variant="outline" size="sm" label="Emitir cuenta de cobro" pendingLabel="Emitiendo…" />
      {state.error ? <span className="text-xs text-[var(--color-danger)]">{state.error}</span> : null}
    </form>
  );
}
