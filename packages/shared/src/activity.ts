import { z } from "zod";

/**
 * Actividad operativa de un negocio vista desde el panel: citas, pagos y
 * conversaciones del bot. Es la data que hoy consume el operador para dar
 * soporte y la que en F7 verá el propio cliente en su portal
 * (docs/PANEL-OPERADOR.md §8.5) — por eso vive en `@spa/shared` y no en el
 * backend: las dos superficies pintan los mismos DTOs.
 */

export interface AppointmentRow {
  id: string;
  code: string;
  /** `YYYY-MM-DD` en la zona del negocio. */
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string;
  source: string;
  serviceName: string;
  customerName: string;
  customerPhone: string | null;
  price: number;
  depositAmount: number | null;
  pendingBalance: number | null;
  createdAt: string;
}

export interface PaymentRow {
  id: string;
  reference: string;
  entityType: string;
  status: string;
  amount: number;
  currency: string;
  provider: string;
  transactionId: string | null;
  createdAt: string;
  /** `updatedAt` de la fila: cuándo el webhook la dejó en su estado final. */
  updatedAt: string;
}

/**
 * Estado de una conversación del bot. **No hay transcripción**: la tabla
 * `whatsapp_conversations` guarda el estado de la máquina (sección 18), no los
 * mensajes. Un historial de mensajes necesitaría una tabla nueva; hasta
 * entonces el panel muestra en qué punto quedó cada conversación.
 */
export interface ConversationRow {
  id: string;
  phone: string;
  customerName: string | null;
  state: string;
  serviceName: string | null;
  /** Fecha elegida en el flujo, si ya llegó a ese paso. */
  date: string | null;
  startTime: string | null;
  appointmentId: string | null;
  createdAt: string;
  /** Último turno registrado (la fila se toca en cada mensaje). */
  updatedAt: string;
}

export interface GiftCardRow {
  id: string;
  code: string;
  buyerName: string;
  recipientName: string;
  amount: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  redeemedAt: string | null;
  expiresAt: string | null;
}

/** Filtros de los listados de actividad (además de la paginación estándar). */
export const activityQuerySchema = z.object({
  /** `YYYY-MM-DD` inclusive. */
  from: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.")
    .optional(),
  to: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD.")
    .optional(),
  status: z.string().trim().max(30).optional(),
});

export type ActivityQuery = z.infer<typeof activityQuerySchema>;
