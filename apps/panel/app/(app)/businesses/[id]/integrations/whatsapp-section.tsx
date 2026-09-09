"use client";

import { useActionState } from "react";
import type { WhatsAppAccountDto } from "@spa/shared";
import { Input } from "@/components/ui/input";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form-field";
import { formatDateTime } from "@/lib/format";
import {
  connectWhatsAppAction,
  disconnectWhatsAppAction,
  verifyWhatsAppAction,
  type FormState,
} from "../../actions";

/**
 * Conexión del número de WhatsApp del cliente (docs/PANEL-OPERADOR.md §7).
 *
 * Hoy es una alta manual: el Embedded Signup —el flujo de "continuar con
 * Facebook" que evita todo esto— exige la verificación de negocio en Meta, que
 * a su vez exige la formalización pendiente (D7/M-1). Mientras tanto se usa el
 * puente de §7.3: el número del cliente vive bajo la WABA del operador y aquí
 * se registran sus identificadores.
 */
export function WhatsAppSection({
  businessId,
  accounts,
}: {
  businessId: string;
  accounts: WhatsAppAccountDto[];
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">WhatsApp</h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          El número desde el que este negocio le contesta a sus clientas. El webhook resuelve el
          tenant por <code className="font-mono text-xs">phone_number_id</code>, así que ese dato
          tiene que coincidir exactamente con el de Meta.
        </p>
      </div>

      {accounts.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {accounts.map((account) => (
            <AccountCard key={account.id} businessId={businessId} account={account} />
          ))}
        </ul>
      ) : (
        <p className="rounded-[var(--radius)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Sin número conectado: los mensajes de este negocio salen con las credenciales globales del
          operador, y el webhook lo resuelve por el número de la ficha en vez de por su
          <code className="mx-1 font-mono text-xs">phone_number_id</code>.
        </p>
      )}

      <ConnectForm businessId={businessId} hasAccounts={accounts.length > 0} />
    </section>
  );
}

function AccountCard({ businessId, account }: { businessId: string; account: WhatsAppAccountDto }) {
  const [verifyState, verifyAction] = useActionState<FormState, FormData>(
    verifyWhatsAppAction.bind(null, businessId, account.id),
    { ok: false },
  );
  const [disconnectState, disconnectAction] = useActionState<FormState, FormData>(
    disconnectWhatsAppAction.bind(null, businessId, account.id),
    { ok: false },
  );

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {account.displayName ?? "Número sin nombre aprobado"}
            {!account.active ? (
              <span className="ml-2 text-xs text-[var(--color-fg-muted)]">(inactivo)</span>
            ) : null}
          </p>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {account.displayPhoneNumber ?? "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={verifyAction}>
            <SubmitButton variant="outline" size="sm" label="Verificar" pendingLabel="Consultando…" />
          </form>
          <form action={disconnectAction}>
            <SubmitButton variant="danger" size="sm" label="Desconectar" pendingLabel="…" />
          </form>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Meta label="WABA" value={account.wabaId} />
        <Meta label="phone_number_id" value={account.phoneNumberId} />
        <Meta label="Token" value={account.accessTokenMask} />
        <Meta label="Calidad" value={account.qualityRating ?? "sin datos"} />
        <Meta label="Límite" value={account.messagingLimit ?? "sin datos"} />
        <Meta label="Conectado" value={formatDateTime(account.createdAt)} />
      </dl>

      {verifyState.error ? (
        <p className="text-sm text-[var(--color-danger)]">{verifyState.error}</p>
      ) : verifyState.ok ? (
        <p className="text-sm text-green-700">{verifyState.message}</p>
      ) : null}
      {disconnectState.error ? (
        <p className="text-sm text-[var(--color-danger)]">{disconnectState.error}</p>
      ) : null}
    </li>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="truncate font-mono" title={value}>
        {value}
      </dd>
    </div>
  );
}

function ConnectForm({ businessId, hasAccounts }: { businessId: string; hasAccounts: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    connectWhatsAppAction.bind(null, businessId),
    { ok: false },
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-[var(--radius)] border border-[var(--color-border)] p-4"
    >
      <div>
        <p className="text-sm font-medium">{hasAccounts ? "Conectar otro número" : "Conectar número"}</p>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Los tres datos salen de Meta Business (WhatsApp → Configuración de la API). Guardar el
          mismo <code className="font-mono text-xs">phone_number_id</code> reemplaza el token del
          número: es también la forma de rotarlo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="wabaId" label="WhatsApp Business Account ID" errors={state.fieldErrors}>
          <Input id="wabaId" name="wabaId" inputMode="numeric" placeholder="102290129340398" required />
        </Field>
        <Field name="phoneNumberId" label="Phone number ID" errors={state.fieldErrors}>
          <Input id="phoneNumberId" name="phoneNumberId" inputMode="numeric" placeholder="106540352242922" required />
        </Field>
        <Field name="displayPhoneNumber" label="Número visible" errors={state.fieldErrors}>
          <Input id="displayPhoneNumber" name="displayPhoneNumber" placeholder="+57 300 123 4567" />
        </Field>
        <Field
          name="displayName"
          label="Nombre visible"
          errors={state.fieldErrors}
          hint="El que Meta aprobó para el número."
        >
          <Input id="displayName" name="displayName" placeholder="Spa Bella" />
        </Field>
        <div className="sm:col-span-2">
          <Field
            name="accessToken"
            label="Token de acceso"
            errors={state.fieldErrors}
            hint="Se guarda cifrado (AES-256-GCM) y no se vuelve a mostrar."
          >
            <Input id="accessToken" name="accessToken" type="password" autoComplete="off" required />
          </Field>
        </div>
      </div>

      <FormAlert state={state} />
      <div>
        <SubmitButton label="Conectar número" pendingLabel="Conectando…" />
      </div>
    </form>
  );
}
