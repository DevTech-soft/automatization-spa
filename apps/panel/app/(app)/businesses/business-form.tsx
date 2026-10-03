"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  businessStatusValues,
  chargeModeValues,
  type BusinessDetail,
} from "@spa/shared";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form-field";
import { createBusinessAction, updateBusinessAction, type FormState } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Prueba",
  ACTIVE: "Activo",
  PAST_DUE: "En mora",
  SUSPENDED: "Suspendido",
  CANCELLED: "Cancelado",
};

export function BusinessForm({ business }: { business?: BusinessDetail }) {
  const isEdit = Boolean(business);
  const action = isEdit
    ? updateBusinessAction.bind(null, business!.id)
    : createBusinessAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, { ok: false });
  const errors = state.fieldErrors;

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? "Datos del negocio" : "Datos básicos"}</CardTitle>
          <CardDescription>
            {isEdit
              ? "Ficha, contacto y modo de cobro. El cambio de estado va en su propia tarjeta."
              : "Con esto basta para crearlo; marca, catálogo e integraciones se cargan después en sus pestañas."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <FormAlert state={state} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="name" label="Nombre" errors={errors}>
              <Input id="name" name="name" required defaultValue={business?.name} />
            </Field>
            {isEdit ? (
              <Field name="slug" label="Slug" hint="No se puede cambiar.">
                <Input id="slug" defaultValue={business?.slug} disabled />
              </Field>
            ) : (
              <Field name="slug" label="Slug" errors={errors} hint="Minúsculas, números y guiones. Va en las URLs.">
                <Input id="slug" name="slug" required placeholder="mi-spa" />
              </Field>
            )}
            <Field name="phone" label="Teléfono" errors={errors}>
              <Input id="phone" name="phone" defaultValue={business?.phone ?? ""} />
            </Field>
            <Field name="whatsappNumber" label="WhatsApp" errors={errors}>
              <Input id="whatsappNumber" name="whatsappNumber" defaultValue={business?.whatsappNumber ?? ""} />
            </Field>
            <Field name="email" label="Correo" errors={errors}>
              <Input id="email" name="email" type="email" defaultValue={business?.email ?? ""} />
            </Field>
            <Field name="currency" label="Moneda" errors={errors}>
              <Input id="currency" name="currency" maxLength={3} defaultValue={business?.currency ?? "COP"} />
            </Field>
            <div className="sm:col-span-2">
              <Field name="timezone" label="Zona horaria" errors={errors}>
                <Input id="timezone" name="timezone" defaultValue={business?.timezone ?? "America/Bogota"} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field name="address" label="Dirección" errors={errors}>
                <Textarea id="address" name="address" defaultValue={business?.address ?? ""} />
              </Field>
            </div>
          </div>

          {isEdit ? (
            <div className="flex flex-col gap-4 border-t border-[var(--color-border)] pt-5">
              <p className="text-sm font-medium">Estado y cobro a las clientas</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field name="status" label="Estado" errors={errors}>
                  <Select id="status" name="status" defaultValue={business!.status}>
                    {businessStatusValues.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field name="chargeMode" label="Modo de cobro" errors={errors}>
                  <Select id="chargeMode" name="chargeMode" defaultValue={business!.chargeMode}>
                    {chargeModeValues.map((c) => (
                      <option key={c} value={c}>
                        {c === "TOTAL" ? "Total (100%)" : "Abono (%)"}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  name="depositPercentage"
                  label="% de abono"
                  errors={errors}
                  hint="Solo en modo abono. Entre 1 y 99."
                >
                  <Input
                    id="depositPercentage"
                    name="depositPercentage"
                    type="number"
                    min={1}
                    max={99}
                    defaultValue={business!.depositPercentage ?? ""}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
                <input type="checkbox" name="active" defaultChecked={business!.active} className="size-4" />
                Activo (flag legacy)
              </label>
            </div>
          ) : null}
        </CardContent>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-6 py-4">
          <Link href="/businesses" className={buttonVariants({ variant: "ghost" })}>
            Cancelar
          </Link>
          <SubmitButton label={isEdit ? "Guardar cambios" : "Crear negocio"} />
        </div>
      </Card>
    </form>
  );
}
