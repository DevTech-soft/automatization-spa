import { z } from "zod";

/**
 * Vertical del negocio: decide qué agente de n8n le contesta (un workflow por
 * vertical, ver docs/AGENTE-N8N.md § Verticales). Vive en
 * `business.settings.vertical`; si falta, el negocio es de belleza, que fue el
 * único vertical hasta que existió este campo.
 */
export const businessVerticals = ["belleza", "salud", "barberia", "mascotas", "generico"] as const;

export type BusinessVertical = (typeof businessVerticals)[number];

export const DEFAULT_VERTICAL: BusinessVertical = "belleza";

export const businessVerticalSchema = z.enum(businessVerticals);

/** Nombre y ejemplos de cada vertical, en el orden del selector del panel. */
export const verticalLabels: Record<BusinessVertical, { label: string; hint: string }> = {
  belleza: { label: "Belleza", hint: "Spa, salón de belleza, uñas, estética." },
  salud: { label: "Salud", hint: "Odontología, fisioterapia, psicología, consultorios." },
  barberia: { label: "Barbería", hint: "Barberías y peluquerías masculinas." },
  mascotas: { label: "Mascotas", hint: "Veterinaria, peluquería canina, guardería." },
  generico: { label: "Genérico", hint: "Cualquier otro negocio que agende citas." },
};

/** Valor guardado (o ausente, o inválido) → vertical efectivo. */
export function readVertical(value: unknown): BusinessVertical {
  const parsed = businessVerticalSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_VERTICAL;
}
