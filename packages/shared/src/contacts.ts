import { z } from "zod";

/**
 * Contactos del cliente al que se le vendió el servicio
 * (docs/PANEL-OPERADOR.md §4, `ClientContact`). Es el lado CRM del panel: a
 * quién llamar cuando el negocio entra en mora o hay que avisar de algo.
 *
 * No confundir con `Customer`: ese es la clienta del spa que reserva citas.
 */

export interface ClientContactDto {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** `YYYY-MM-DD` — cuándo se cerró la venta. */
  soldAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const upsertContactSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres.").max(120),
  phone: optionalText(30),
  email: z.string().trim().email("Correo inválido.").optional().or(z.literal("")),
  soldAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.")
    .optional()
    .or(z.literal("")),
  notes: optionalText(1000),
});

export type UpsertContactInput = z.infer<typeof upsertContactSchema>;
