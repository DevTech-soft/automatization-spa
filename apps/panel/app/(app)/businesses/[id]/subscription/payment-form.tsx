"use client";

import { useActionState, useState } from "react";
import type { OperatorInvoiceListItem, SubscriptionPlanDto } from "@spa/shared";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form-field";
import { formatDate, formatMoney } from "@/lib/format";
import { registerPaymentAction } from "../../../billing/actions";
import type { FormState } from "../../actions";

/** Formas de pago que el operador usa hoy (§13: cobra a cuenta personal). */
const METHODS = ["Transferencia", "Nequi", "Daviplata", "Bancolombia", "Efectivo", "Otro"];

/**
 * Registro de un pago recibido (docs/PANEL-OPERADOR.md §6.4). Marcar cuentas
 * las salda; el monto se prellena con lo que suman las seleccionadas para que
 * el caso normal —"me pagó justo lo que le cobré"— sea un clic y guardar.
 */
export function PaymentForm({
  businessId,
  plan,
  outstanding,
}: {
  businessId: string;
  plan: SubscriptionPlanDto | null;
  outstanding: OperatorInvoiceListItem[];
}) {
  const action = registerPaymentAction.bind(null, businessId);
  const [state, formAction] = useActionState<FormState, FormData>(action, { ok: false });

  const [selected, setSelected] = useState<string[]>(outstanding.map((invoice) => invoice.id));

  const selectedTotal = outstanding
    .filter((invoice) => selected.includes(invoice.id))
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const amount = selectedTotal > 0 ? selectedTotal : (plan?.price ?? 0);
  const today = new Date().toISOString().slice(0, 10);

  function toggle(id: string): void {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {outstanding.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Cuentas que salda este pago</legend>
          {outstanding.map((invoice) => (
            <label
              key={invoice.id}
              className="flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                name="invoiceIds"
                value={invoice.id}
                checked={selected.includes(invoice.id)}
                onChange={() => toggle(invoice.id)}
                className="size-4"
              />
              <span className="font-mono text-xs">{invoice.number}</span>
              <span className="text-[var(--color-fg-muted)]">vence {formatDate(invoice.dueAt)}</span>
              <span className="ml-auto tabular-nums">{formatMoney(invoice.total, invoice.currency)}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-[var(--color-fg-muted)]">
          No hay cuentas pendientes. Puedes registrar el pago igual: extenderá la vigencia del plan.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field name="paidAt" label="Fecha del pago" errors={state.fieldErrors}>
          <Input id="paidAt" name="paidAt" type="date" defaultValue={today} required />
        </Field>
        <Field name="amount" label="Monto" errors={state.fieldErrors}>
          {/* `key` fuerza el remount al cambiar la selección: sin él, React
              conserva el valor tecleado y el prellenado dejaría de reflejarla. */}
          <Input
            key={amount}
            id="amount"
            name="amount"
            type="number"
            min={1}
            step={1000}
            defaultValue={amount || undefined}
            required
          />
        </Field>
        <Field name="method" label="Método" errors={state.fieldErrors}>
          <Select id="method" name="method" defaultValue="Transferencia">
            {METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </Select>
        </Field>
        <Field name="reference" label="Referencia" errors={state.fieldErrors}>
          <Input id="reference" name="reference" placeholder="Comprobante o últimos dígitos" />
        </Field>
      </div>

      <Field
        name="extendDays"
        label="Días a extender"
        errors={state.fieldErrors}
        hint={
          plan
            ? `Vacío = un ciclo completo (${plan.cycle === "MONTHLY" ? 30 : 365} días). Usa 60 si pagó dos meses.`
            : "El negocio no tiene plan: la vigencia no se mueve."
        }
      >
        <Input id="extendDays" name="extendDays" type="number" min={0} max={730} className="max-w-40" />
      </Field>

      <FormAlert state={state} />
      <div>
        <SubmitButton label="Registrar pago" pendingLabel="Registrando…" disabled={!plan && outstanding.length === 0} />
      </div>
    </form>
  );
}
