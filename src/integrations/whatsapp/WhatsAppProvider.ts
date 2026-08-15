export interface InteractiveListRow {
  id: string;
  title: string;
  description?: string | undefined;
}

export interface InteractiveListSection {
  title?: string | undefined;
  rows: InteractiveListRow[];
}

export interface InteractiveButton {
  id: string;
  title: string;
}

export type InteractiveMessage =
  | { type: "list"; bodyText: string; buttonText: string; sections: InteractiveListSection[] }
  | { type: "buttons"; bodyText: string; buttons: InteractiveButton[] };

/** `to` es el número de WhatsApp del negocio que recibió el mensaje — resuelve el tenant (sección 5). */
export type IncomingWhatsAppMessage =
  | { kind: "text"; from: string; to: string; text: string; contactName?: string | undefined }
  | { kind: "interactive_reply"; from: string; to: string; replyId: string; contactName?: string | undefined }
  /** Delivery receipts, read receipts, etc. — no acción del bot, solo ack 200. */
  | { kind: "ignored" };

/**
 * Capa de abstracción del canal de WhatsApp (sección 26 del prompt maestro).
 * Ningún otro módulo debe hablar con la API de Meta directamente — así cambiar
 * de proveedor (ej. otro BSP) implica solo escribir un adapter nuevo.
 */
export interface WhatsAppProvider {
  readonly name: string;

  sendText(to: string, text: string): Promise<void>;

  sendTemplate(to: string, templateName: string, params: string[]): Promise<void>;

  sendInteractiveMessage(to: string, message: InteractiveMessage): Promise<void>;

  sendDocument(to: string, documentUrl: string, caption?: string): Promise<void>;

  /** Normaliza el payload del webhook. Devuelve `{ kind: "ignored" }` para eventos que no son mensajes entrantes. */
  parseIncomingMessage(rawPayload: unknown): IncomingWhatsAppMessage;

  /**
   * Valida `X-Hub-Signature-256` contra el app secret. Si no hay app secret
   * configurado, el adapter permite el paso con un warning (ver docs/WHATSAPP.md) —
   * es una brecha conocida a cerrar antes de producción, no un requisito
   * bloqueante para el MVP (sección 38 no incluye un app secret obligatorio).
   */
  validateWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean;
}
