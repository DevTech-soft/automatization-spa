"use client";

import { useActionState, useState } from "react";
import { weekdayLabels, type BusinessHourDto } from "@spa/shared";
import { Input } from "@/components/ui/input";
import { FormAlert, SubmitButton } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { saveBusinessHoursAction, type FormState } from "../../actions";

/** Lunes primero: así lee la semana el negocio, aunque en DB domingo sea 0. */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * Horario semanal en una sola tabla y un solo "Guardar". Un día cerrado
 * conserva sus horas (deshabilitadas) para reabrirlo con un clic.
 */
export function HoursEditor({
  businessId,
  hours,
  timezone,
}: {
  businessId: string;
  hours: BusinessHourDto[];
  timezone: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    saveBusinessHoursAction.bind(null, businessId),
    { ok: false },
  );
  const [open, setOpen] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(hours.map((h) => [h.dayOfWeek, h.active])),
  );
  const byDay = new Map(hours.map((h) => [h.dayOfWeek, h]));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Horarios de atención</h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Hora local del negocio ({timezone}). Las citas ya agendadas fuera del nuevo horario no se cancelan.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)]">
          {DISPLAY_ORDER.map((day) => {
            const hour = byDay.get(day);
            const isOpen = open[day] ?? false;
            const error = state.fieldErrors?.[`day-${day}`]?.[0];
            return (
              <li key={day} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex w-36 items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      name={`day-${day}-active`}
                      checked={isOpen}
                      onChange={(e) => setOpen((prev) => ({ ...prev, [day]: e.target.checked }))}
                      className="size-4"
                    />
                    {weekdayLabels[day]}
                  </label>
                  <div className={cn("flex items-center gap-2 text-sm", !isOpen && "opacity-50")}>
                    <Input
                      type="time"
                      name={`day-${day}-open`}
                      aria-label={`Apertura ${weekdayLabels[day]}`}
                      defaultValue={hour?.openTime ?? "09:00"}
                      readOnly={!isOpen}
                      className="w-32"
                    />
                    <span className="text-[var(--color-fg-muted)]">a</span>
                    <Input
                      type="time"
                      name={`day-${day}-close`}
                      aria-label={`Cierre ${weekdayLabels[day]}`}
                      defaultValue={hour?.closeTime ?? "18:00"}
                      readOnly={!isOpen}
                      className="w-32"
                    />
                  </div>
                  {!isOpen ? <span className="text-sm text-[var(--color-fg-muted)]">Cerrado</span> : null}
                </div>
                {error ? <p className="text-xs text-[var(--color-danger)]">{error}</p> : null}
              </li>
            );
          })}
        </ul>

        <FormAlert state={state} />
        <div>
          <SubmitButton label="Guardar horarios" />
        </div>
      </form>
    </section>
  );
}
