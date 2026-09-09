"use client";

import { useActionState } from "react";
import type { SubscriptionPlanDto, UpsertSubscriptionInput } from "@spa/shared";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form-field";
import { extendSubscriptionAction, upsertSubscriptionAction, type FormState } from "../../actions";

/**
 * Plan del cliente (docs/PANEL-OPERADOR.md §6.5). Si todavía no tiene, el
 * formulario llega prellenado con los defaults que sugiere el backend (D8:
 * mensual $50.000, 3 días de gracia, vigencia = prueba de 7 días).
 */
export function SubscriptionForm({
  businessId,
  plan,
  suggested,
}: {
  businessId: string;
  plan: SubscriptionPlanDto | null;
  suggested: UpsertSubscriptionInput | null;
}) {
  const action = upsertSubscriptionAction.bind(null, businessId);
  const [state, formAction] = useActionState<FormState, FormData>(action, { ok: false });

  const defaults = plan ?? suggested;

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Nombre del plan" errors={state.fieldErrors}>
            <Input id="name" name="name" defaultValue={defaults?.name ?? "mensual"} required />
          </Field>
          <Field name="price" label="Precio" errors={state.fieldErrors} hint="Sin puntos ni símbolos.">
            <Input
              id="price"
              name="price"
              type="number"
              min={0}
              step={1000}
              defaultValue={defaults?.price ?? 50000}
              required
            />
          </Field>
          <Field name="currency" label="Moneda" errors={state.fieldErrors}>
            <Input id="currency" name="currency" defaultValue={defaults?.currency ?? "COP"} maxLength={3} required />
          </Field>
          <Field name="cycle" label="Ciclo" errors={state.fieldErrors}>
            <Select id="cycle" name="cycle" defaultValue={defaults?.cycle ?? "MONTHLY"}>
              <option value="MONTHLY">Mensual (30 días)</option>
              <option value="ANNUAL">Anual (365 días)</option>
            </Select>
          </Field>
          <Field
            name="validUntil"
            label="Vigente hasta"
            errors={state.fieldErrors}
            hint="Se recalcula sola con cada pago registrado."
          >
            <Input id="validUntil" name="validUntil" type="date" defaultValue={defaults?.validUntil} required />
          </Field>
          <Field
            name="graceDays"
            label="Días de gracia"
            errors={state.fieldErrors}
            hint="Días tras el vencimiento antes de suspender."
          >
            <Input
              id="graceDays"
              name="graceDays"
              type="number"
              min={0}
              max={60}
              defaultValue={defaults?.graceDays ?? 3}
              required
            />
          </Field>
        </div>

        <FormAlert state={state} />
        <div>
          <SubmitButton label={plan ? "Guardar plan" : "Crear plan"} />
        </div>
      </form>

      {plan ? <ExtendForm businessId={businessId} /> : null}
    </div>
  );
}

/** Cortesías y extensiones de prueba: corre la vigencia sin registrar un pago. */
function ExtendForm({ businessId }: { businessId: string }) {
  const action = extendSubscriptionAction.bind(null, businessId);
  const [state, formAction] = useActionState<FormState, FormData>(action, { ok: false });

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--color-border)] p-4"
    >
      <div>
        <p className="text-sm font-medium">Extender vigencia sin cobrar</p>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Para cortesías o alargar la prueba. Si el plan ya venció, los días cuentan desde hoy.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28">
          <Field name="days" label="Días" errors={state.fieldErrors}>
            <Input id="days" name="days" type="number" min={1} max={365} defaultValue={7} required />
          </Field>
        </div>
        <div className="min-w-48 flex-1">
          <Field name="reason" label="Motivo">
            <Input id="reason" name="reason" placeholder="Cortesía por demora en el onboarding" />
          </Field>
        </div>
        <SubmitButton variant="outline" label="Extender" pendingLabel="Extendiendo…" />
      </div>
      <FormAlert state={state} />
    </form>
  );
}
