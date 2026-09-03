export interface CreatePaymentInput {
  reference: string;
  /** Monto en la unidad mayor de la moneda (ej. pesos, no centavos). */
  amount: number;
  currency: string;
  redirectUrl: string;
  customerEmail?: string | undefined;
}

export interface CreatePaymentResult {
  paymentUrl: string;
  provider: string;
  reference: string;
}

export type WebhookEventStatus = "APPROVED" | "DECLINED" | "PENDING" | "VOIDED" | "ERROR";

export interface WebhookEvent {
  provider: string;
  reference: string;
  transactionId: string;
  status: WebhookEventStatus;
  /** Monto en centavos, para comparar sin errores de precisión de punto flotante. */
  amountInCents: number;
  currency: string;
  raw: unknown;
}

/**
 * Capa de abstracción de pasarela de pago (sección 25 del prompt maestro). No
 * acoplar el resto de la aplicación a un proveedor específico — toda la
 * lógica de negocio depende únicamente de esta interfaz.
 */
export interface PaymentProvider {
  readonly name: string;

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;

  /** Valida la firma del webhook. Debe rechazar payloads mal formados o con firma inválida. */
  validateWebhook(rawPayload: unknown): boolean;

  /** Solo debe llamarse después de que `validateWebhook` devuelva `true`. */
  parseWebhook(rawPayload: unknown): WebhookEvent;
}
