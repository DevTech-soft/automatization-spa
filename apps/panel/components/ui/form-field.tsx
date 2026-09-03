"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Piezas compartidas por los formularios del panel (Server Actions + Zod). */

export interface FieldErrors {
  [field: string]: string[];
}

export function Field({
  name,
  label,
  errors,
  children,
  hint,
}: {
  name: string;
  label: string;
  errors?: FieldErrors | undefined;
  children: React.ReactNode;
  hint?: string;
}) {
  const err = errors?.[name];
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-[var(--color-fg-muted)]">{hint}</p> : null}
      {err ? <p className="text-xs text-[var(--color-danger)]">{err[0]}</p> : null}
    </div>
  );
}

export function SubmitButton({
  label,
  pendingLabel = "Guardando…",
  ...props
}: { label: string; pendingLabel?: string } & Omit<React.ComponentProps<typeof Button>, "children">) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} disabled={pending || props.disabled}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function FormAlert({ state }: { state: { ok: boolean; error?: string | undefined } }) {
  if (state.error) {
    return (
      <p className="rounded-[var(--radius)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="rounded-[var(--radius)] border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
        Cambios guardados.
      </p>
    );
  }
  return null;
}
