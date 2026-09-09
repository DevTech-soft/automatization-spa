"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { OperatorInvoiceDetail } from "@spa/shared";
import { Input } from "@/components/ui/input";
import { FormAlert, SubmitButton } from "@/components/ui/form-field";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateInvoicePdfAction, invoiceActionAction } from "../actions";
import type { FormState } from "../../businesses/actions";

/**
 * Acciones sobre una cuenta de cobro. La transición la revalida el backend
 * (§6.5): aquí solo se ocultan los botones que no aplican al estado actual.
 */
export function InvoiceActions({ invoice }: { invoice: OperatorInvoiceDetail }) {
  const action = invoiceActionAction.bind(null, invoice.id);
  const [state, formAction] = useActionState<FormState, FormData>(action, { ok: false });
  const [pdfState, pdfAction] = useActionState<FormState, FormData>(
    generateInvoicePdfAction.bind(null, invoice.id),
    { ok: false },
  );

  const closed = invoice.status === "PAID" || invoice.status === "VOID";

  return (
    <div className="flex flex-col gap-4 border-t border-[var(--color-border)] pt-6">
      <h2 className="text-base font-semibold">Acciones</h2>

      <div className="flex flex-wrap items-center gap-3">
        <form action={pdfAction}>
          <SubmitButton
            variant="outline"
            size="sm"
            label={invoice.pdfUrl ? "Regenerar PDF" : "Generar PDF"}
            pendingLabel="Generando…"
          />
        </form>

        {invoice.status === "DRAFT" ? (
          <form action={formAction}>
            <input type="hidden" name="action" value="send" />
            <SubmitButton size="sm" label="Marcar como enviada" pendingLabel="Guardando…" />
          </form>
        ) : null}

        {!closed ? (
          <Link
            href={`/businesses/${invoice.businessId}/subscription`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Registrar pago
          </Link>
        ) : null}
      </div>

      <FormAlert state={pdfState} />

      {!closed ? (
        <form action={formAction} className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--color-border)] p-4">
          <input type="hidden" name="action" value="void" />
          <p className="text-sm font-medium">Anular</p>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Deja la cuenta sin efecto y la saca de la cartera. No se puede deshacer: emite una nueva
            si hace falta.
          </p>
          <Input name="reason" placeholder="Motivo (opcional)" className="max-w-md" />
          <div>
            <SubmitButton variant="danger" size="sm" label="Anular cuenta" pendingLabel="Anulando…" />
          </div>
          {state.error ? <p className="text-sm text-[var(--color-danger)]">{state.error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
