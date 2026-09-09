"use client";

import { useActionState } from "react";
import type { BusinessDetail, BusinessStatus } from "@spa/shared";
import { ALLOWED_STATUS_TRANSITIONS, BUSINESS_STATUS_LABEL } from "@spa/shared";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form-field";
import { changeStatusAction, type FormState } from "../actions";

/**
 * Cambio de estado del negocio (docs/PANEL-OPERADOR.md §5). Suspender corta el
 * bot, las reservas web y las gift cards del cliente al instante, así que el
 * motivo es obligatorio y el cambio queda en la bitácora.
 *
 * Las opciones se limitan a las transiciones legales desde el estado actual;
 * el backend las revalida igual.
 */
const CONSEQUENCE: Partial<Record<BusinessStatus, string>> = {
  ACTIVE: "Vuelve a atender: bot, reservas web y gift cards quedan disponibles.",
  PAST_DUE: "Sigue atendiendo normalmente, pero queda marcado en cartera como moroso.",
  SUSPENDED: "Corta el servicio: el bot deja de responder y las reservas nuevas se rechazan.",
  CANCELLED: "Cierre definitivo. La data se conserva, pero el negocio deja de existir de cara a sus clientas.",
};

export function StatusForm({ business }: { business: BusinessDetail }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    changeStatusAction.bind(null, business.id),
    { ok: false },
  );

  // `TRIAL → ACTIVE` no se ofrece aquí: activar exige el checklist completo y
  // vive en la pestaña de Onboarding.
  const options = ALLOWED_STATUS_TRANSITIONS[business.status].filter(
    (status) => !(business.status === "TRIAL" && status === "ACTIVE"),
  );

  if (options.length === 0) {
    return null;
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-[var(--radius)] border border-[var(--color-border)] p-4"
    >
      <div>
        <p className="text-sm font-medium">Estado del servicio</p>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Ahora está en <strong>{BUSINESS_STATUS_LABEL[business.status]}</strong>. El cambio se
          aplica de inmediato y queda registrado con tu usuario.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="status" label="Nuevo estado" errors={state.fieldErrors}>
          <Select id="status" name="status" defaultValue={options[0]}>
            {options.map((status) => (
              <option key={status} value={status}>
                {BUSINESS_STATUS_LABEL[status]} — {CONSEQUENCE[status]}
              </option>
            ))}
          </Select>
        </Field>
        <Field name="reason" label="Motivo" errors={state.fieldErrors}>
          <Input id="reason" name="reason" placeholder="No pagó la cuenta de septiembre" required />
        </Field>
      </div>

      <FormAlert state={state} />
      <div>
        <SubmitButton variant="outline" label="Cambiar estado" pendingLabel="Aplicando…" />
      </div>
    </form>
  );
}
