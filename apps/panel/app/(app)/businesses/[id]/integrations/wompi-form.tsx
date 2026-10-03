"use client";

import { useActionState } from "react";
import type { PaymentCredentialsDto } from "@spa/shared";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form-field";
import { formatDateTime } from "@/lib/format";
import {
  deletePaymentCredentialsAction,
  upsertPaymentCredentialsAction,
  type FormState,
} from "../../actions";

/**
 * Llaves de Wompi del negocio (docs/PANEL-OPERADOR.md §D3/§D6). El operador
 * crea la cuenta de Wompi del cliente y registra las llaves aquí; el panel solo
 * las guarda cifradas.
 *
 * Las cuatro se piden siempre juntas: son un juego, y guardar tres de cuatro
 * dejaría al negocio cobrando con una mezcla de credenciales.
 */
const KEYS = [
  {
    name: "publicKey",
    label: "Llave pública",
    hint: "pub_prod_… — va en la URL del checkout.",
  },
  {
    name: "apiKey",
    label: "Llave privada",
    hint: "prv_prod_… — no se usa en el checkout, se guarda para llamadas server-to-server.",
  },
  {
    name: "integritySecret",
    label: "Secreto de integridad",
    hint: "Firma el checkout (Wompi → Eventos → Integridad).",
  },
  {
    name: "webhookSecret",
    label: "Secreto de eventos",
    hint: "Valida la firma de los webhooks entrantes de ese comercio.",
  },
] as const;

export function WompiForm({
  businessId,
  credentials,
}: {
  businessId: string;
  credentials: PaymentCredentialsDto;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    upsertPaymentCredentialsAction.bind(null, businessId),
    { ok: false },
  );
  const [deleteState, deleteAction] = useActionState<FormState, FormData>(
    deletePaymentCredentialsAction.bind(null, businessId),
    { ok: false },
  );

  const masks: Record<string, string> = {
    publicKey: credentials.publicKeyMask,
    apiKey: credentials.apiKeyMask,
    integritySecret: credentials.integritySecretMask,
    webhookSecret: credentials.webhookSecretMask,
  };

  return (
    <div className="flex flex-col gap-4">
      {credentials.usingGlobalFallback ? (
        <Callout tone="warning" title="Cobra con las llaves globales del operador">
          El dinero de sus reservas cae en la cuenta de Wompi del operador, no en la suya.
        </Callout>
      ) : (
        <Callout tone="success" title="Llaves propias configuradas">
          Entorno de {credentials.environment === "PROD" ? "producción" : "pruebas"}, guardadas el{" "}
          {formatDateTime(credentials.configuredAt)}.
        </Callout>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <div className="max-w-xs">
          <Field name="environment" label="Entorno" errors={state.fieldErrors}>
            <Select id="environment" name="environment" defaultValue={credentials.environment}>
              <option value="PROD">Producción</option>
              <option value="TEST">Pruebas</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {KEYS.map((key) => (
            <Field
              key={key.name}
              name={key.name}
              label={key.label}
              errors={state.fieldErrors}
              hint={
                credentials.usingGlobalFallback
                  ? key.hint
                  : `${key.hint} Actual: ${masks[key.name]}`
              }
            >
              <Input
                id={key.name}
                name={key.name}
                type={key.name === "publicKey" ? "text" : "password"}
                autoComplete="off"
                required
              />
            </Field>
          ))}
        </div>

        <FormAlert state={state} />
        <div>
          <SubmitButton label={credentials.usingGlobalFallback ? "Guardar llaves" : "Reemplazar llaves"} />
        </div>
      </form>

      {!credentials.usingGlobalFallback ? (
        <form action={deleteAction} className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
          <p className="text-sm text-[var(--color-fg-muted)]">
            Eliminar las llaves devuelve el negocio a las credenciales globales del operador.
          </p>
          <div>
            <SubmitButton variant="outline" size="sm" label="Eliminar llaves propias" pendingLabel="…" />
          </div>
          {deleteState.error ? (
            <p className="text-sm text-[var(--color-danger)]">{deleteState.error}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
