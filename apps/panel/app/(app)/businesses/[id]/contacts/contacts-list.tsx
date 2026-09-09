"use client";

import { useActionState, useState } from "react";
import { Mail, Phone } from "lucide-react";
import type { ClientContactDto } from "@spa/shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form-field";
import { formatDate } from "@/lib/format";
import { deleteContactAction, saveContactAction, type FormState } from "../../actions";

/**
 * Lista y edición de contactos del cliente. Se edita en línea (un contacto
 * abierto a la vez) en vez de en una página aparte: son tres campos y el
 * operador entra aquí a buscar un teléfono, no a llenar formularios.
 */
export function ContactsList({
  businessId,
  contacts,
}: {
  businessId: string;
  contacts: ClientContactDto[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Contactos</h2>
          <p className="text-sm text-[var(--color-fg-muted)]">
            La persona con la que hablas de este negocio: cobros, soporte, renovación.
          </p>
        </div>
        {!adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            Nuevo contacto
          </Button>
        ) : null}
      </div>

      {adding ? (
        <ContactForm
          businessId={businessId}
          contact={null}
          onDone={() => setAdding(false)}
        />
      ) : null}

      {contacts.length === 0 && !adding ? (
        <p className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] px-4 py-8 text-center text-sm text-[var(--color-fg-muted)]">
          Todavía no registraste a nadie.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {contacts.map((contact) =>
          editing === contact.id ? (
            <li key={contact.id}>
              <ContactForm
                businessId={businessId}
                contact={contact}
                onDone={() => setEditing(null)}
              />
            </li>
          ) : (
            <li
              key={contact.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] p-4"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-medium">{contact.name}</p>
                <div className="flex flex-wrap gap-4 text-sm text-[var(--color-fg-muted)]">
                  {contact.phone ? (
                    <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <Phone className="size-3.5" />
                      {contact.phone}
                    </a>
                  ) : null}
                  {contact.email ? (
                    <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <Mail className="size-3.5" />
                      {contact.email}
                    </a>
                  ) : null}
                  {contact.soldAt ? <span>Cliente desde {formatDate(contact.soldAt)}</span> : null}
                </div>
                {contact.notes ? (
                  <p className="whitespace-pre-line text-sm text-[var(--color-fg-muted)]">{contact.notes}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(contact.id)}>
                  Editar
                </Button>
                <DeleteButton businessId={businessId} contactId={contact.id} />
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function ContactForm({
  businessId,
  contact,
  onDone,
}: {
  businessId: string;
  contact: ClientContactDto | null;
  onDone: () => void;
}) {
  const action = saveContactAction.bind(null, businessId, contact?.id ?? null);
  const [state, formAction] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.ok) onDone();
    return result;
  }, { ok: false });

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Nombre" errors={state.fieldErrors}>
          <Input id="name" name="name" defaultValue={contact?.name ?? ""} required />
        </Field>
        <Field name="phone" label="Teléfono" errors={state.fieldErrors}>
          <Input id="phone" name="phone" defaultValue={contact?.phone ?? ""} placeholder="+57 300 123 4567" />
        </Field>
        <Field name="email" label="Correo" errors={state.fieldErrors}>
          <Input id="email" name="email" type="email" defaultValue={contact?.email ?? ""} />
        </Field>
        <Field name="soldAt" label="Cliente desde" errors={state.fieldErrors}>
          <Input id="soldAt" name="soldAt" type="date" defaultValue={contact?.soldAt ?? ""} />
        </Field>
      </div>
      <Field name="notes" label="Notas" errors={state.fieldErrors}>
        <Textarea id="notes" name="notes" rows={3} defaultValue={contact?.notes ?? ""} />
      </Field>

      <FormAlert state={state} />
      <div className="flex gap-2">
        <SubmitButton label={contact ? "Guardar" : "Crear contacto"} />
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function DeleteButton({ businessId, contactId }: { businessId: string; contactId: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    deleteContactAction.bind(null, businessId, contactId),
    { ok: false },
  );

  return (
    <form action={formAction}>
      <SubmitButton
        variant="ghost"
        size="sm"
        label="Eliminar"
        pendingLabel="…"
        aria-label="Eliminar contacto"
      />
      {state.error ? <span className="text-xs text-[var(--color-danger)]">{state.error}</span> : null}
    </form>
  );
}
