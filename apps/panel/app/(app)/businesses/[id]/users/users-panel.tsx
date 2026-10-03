"use client";

import { useActionState, useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { PORTAL_ROLE_LABELS, PORTAL_ROLES, type BusinessUserDto } from "@spa/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form-field";
import { formatDateTime } from "@/lib/format";
import {
  createBusinessUserAction,
  removeBusinessUserAction,
  resetBusinessUserPasswordAction,
  updateBusinessUserRoleAction,
  type FormState,
  type UserCredentialsState,
} from "../../actions";

/**
 * Alta y administración de los usuarios del portal de un negocio. La
 * contraseña temporal se muestra una sola vez (al crear o restablecer): el
 * backend no la guarda en claro y no hay forma de volver a pedirla.
 */
export function UsersPanel({ businessId, users }: { businessId: string; users: BusinessUserDto[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Usuarios del portal</h2>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Quién del negocio puede entrar a ver sus citas, clientas y conversaciones. El equipo no ve pagos
            ni métricas de ingresos.
          </p>
        </div>
        {!adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            Nuevo usuario
          </Button>
        ) : null}
      </div>

      {adding ? <CreateUserForm businessId={businessId} onClose={() => setAdding(false)} /> : null}

      {users.length === 0 && !adding ? (
        <p className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] px-4 py-8 text-center text-sm text-[var(--color-fg-muted)]">
          Este negocio todavía no tiene usuarios. Crea el del dueño(a) para darle acceso al portal.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {users.map((user) => (
          <UserRow key={user.userId} businessId={businessId} user={user} />
        ))}
      </ul>
    </div>
  );
}

function CreateUserForm({ businessId, onClose }: { businessId: string; onClose: () => void }) {
  const [state, formAction] = useActionState<UserCredentialsState, FormData>(
    createBusinessUserAction.bind(null, businessId),
    { ok: false },
  );

  if (state.ok && state.temporaryPassword) {
    return (
      <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] p-4">
        <CredentialsNotice email={state.email ?? ""} password={state.temporaryPassword} />
        <div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Listo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] p-4"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="name" label="Nombre" errors={state.fieldErrors}>
          <Input id="name" name="name" required />
        </Field>
        <Field name="email" label="Correo (usuario)" errors={state.fieldErrors}>
          <Input id="email" name="email" type="email" autoComplete="off" required />
        </Field>
        <Field name="role" label="Rol" errors={state.fieldErrors}>
          <Select id="role" name="role" defaultValue="owner">
            {PORTAL_ROLES.map((role) => (
              <option key={role} value={role}>
                {PORTAL_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <FormAlert state={state} />
      <div className="flex gap-2">
        <SubmitButton label="Crear usuario" pendingLabel="Creando…" />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function UserRow({ businessId, user }: { businessId: string; user: BusinessUserDto }) {
  const [resetState, resetAction] = useActionState<UserCredentialsState, FormData>(
    resetBusinessUserPasswordAction.bind(null, businessId, user.userId),
    { ok: false },
  );
  const [roleState, roleAction] = useActionState<FormState, FormData>(
    updateBusinessUserRoleAction.bind(null, businessId, user.userId),
    { ok: false },
  );
  const [removeState, removeAction] = useActionState<FormState, FormData>(
    removeBusinessUserAction.bind(null, businessId, user.userId),
    { ok: false },
  );
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const otherRole = user.role === "owner" ? "member" : "owner";
  const error = resetState.error ?? roleState.error ?? removeState.error;

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-2 font-medium">
            {user.name}
            <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs font-normal text-[var(--color-fg-muted)]">
              {PORTAL_ROLE_LABELS[user.role]}
            </span>
            {user.twoFactorEnabled ? <ShieldCheck className="size-4 text-green-600" aria-label="2FA activo" /> : null}
          </p>
          <p className="text-sm text-[var(--color-fg-muted)]">{user.email}</p>
          <p className="text-xs text-[var(--color-fg-muted)]">
            {user.lastSeenAt ? `Último ingreso ${formatDateTime(user.lastSeenAt)}` : "Nunca ha entrado"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <form action={roleAction}>
            <input type="hidden" name="role" value={otherRole} />
            <SubmitButton
              variant="ghost"
              size="sm"
              label={`Pasar a ${PORTAL_ROLE_LABELS[otherRole]}`}
              pendingLabel="…"
            />
          </form>
          <form action={resetAction}>
            <SubmitButton variant="ghost" size="sm" label="Nueva contraseña" pendingLabel="…" />
          </form>
          {confirmingRemove ? (
            <form action={removeAction} className="flex items-center gap-1">
              <SubmitButton variant="danger" size="sm" label="Quitar" pendingLabel="…" />
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingRemove(false)}>
                Cancelar
              </Button>
            </form>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmingRemove(true)}>
              Quitar acceso
            </Button>
          )}
        </div>
      </div>
      {resetState.ok && resetState.temporaryPassword ? (
        <CredentialsNotice email={user.email} password={resetState.temporaryPassword} reset />
      ) : null}
      {error ? <FormAlert state={{ ok: false, error }} /> : null}
    </li>
  );
}

function CredentialsNotice({ email, password, reset = false }: { email: string; password: string; reset?: boolean }) {
  const [copied, setCopied] = useState(false);
  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const message = `Acceso al portal: ${loginUrl}\nUsuario: ${email}\nContraseña temporal: ${password}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">
        {reset ? "Contraseña restablecida y sesiones abiertas cerradas." : "Usuario creado."} Esta contraseña no se
        vuelve a mostrar: cópiala y envíasela al cliente.
      </p>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-white/70 p-2 font-mono text-xs">{message}</pre>
      <div>
        <Button size="sm" variant="outline" type="button" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copiado" : "Copiar mensaje"}
        </Button>
      </div>
    </div>
  );
}
