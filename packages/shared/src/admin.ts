import { z } from "zod";

/** Respuesta de `GET /admin/me` — quién es el operador de la sesión actual. */
export const adminMeSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  /** Organización activa de la sesión (tenant). `null` para el operador global de v1. */
  activeOrganizationId: z.string().nullable(),
});

export type AdminMeResponse = z.infer<typeof adminMeSchema>;

/** Envoltorio estándar de las respuestas del backend: `{ data: ... }`. */
export const apiEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) => z.object({ data });
