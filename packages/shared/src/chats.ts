import { z } from "zod";

/**
 * Transcripción de WhatsApp por negocio (docs/PANEL-OPERADOR.md F7). Un "chat"
 * es el hilo con un número; los mensajes incluyen lo que escribió la clienta y
 * lo que le respondió el bot, el agente o una notificación.
 *
 * Distinto de `ConversationRow` (activity.ts): esa es la fila de estado de la
 * máquina del bot, sin mensajes.
 */

export const chatMessageSourceValues = ["CUSTOMER", "BOT", "AGENT", "NOTIFICATION"] as const;
export type ChatMessageSource = (typeof chatMessageSourceValues)[number];
export type ChatMessageDirection = "INBOUND" | "OUTBOUND";

/** Fila del listado de chats: `GET /admin/businesses/:id/chats`, `GET /portal/chats`. */
export interface ChatThread {
  /** Solo dígitos (como llega de Meta). Es la llave del hilo en la URL. */
  phone: string;
  /** Nombre de `customers` si ya reservó; si no, el de su perfil de WhatsApp. */
  displayName: string | null;
  customerId: string | null;
  lastBody: string;
  lastDirection: ChatMessageDirection;
  lastSource: ChatMessageSource;
  lastMessageAt: string;
  messageCount: number;
  /** Paso del bot de menús (`ConversationState`), si el número pasó por él. */
  conversationState: string | null;
}

export interface ChatMessage {
  id: string;
  direction: ChatMessageDirection;
  source: ChatMessageSource;
  /** `text`, `interactive`, `interactive_reply`, `template`, `document`, o el tipo no soportado (`image`…). */
  type: string;
  body: string;
  /** Opciones de una lista o botones que se le ofrecieron. */
  options: string[] | null;
  /** URL de un documento enviado (gift card en PDF, p. ej.). */
  url: string | null;
  createdAt: string;
}

/** `GET .../chats/:phone`. Mensajes del más viejo al más nuevo. */
export interface ChatDetail {
  phone: string;
  displayName: string | null;
  contactName: string | null;
  customerId: string | null;
  messages: ChatMessage[];
  /** Hay mensajes más viejos: pedirlos con `?before=<nextBefore>`. */
  hasMore: boolean;
  nextBefore: string | null;
}

export const chatPhoneParamSchema = z.string().regex(/^\d{6,20}$/, "Teléfono inválido.");

export const chatDetailQuerySchema = z.object({
  before: z.string().datetime().optional(),
});

export type ChatDetailQuery = z.infer<typeof chatDetailQuerySchema>;
