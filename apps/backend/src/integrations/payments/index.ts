import { env } from "../../config/env.js";
import { WompiPaymentProvider, extractWompiReference } from "./WompiPaymentProvider.js";
import type { PaymentProvider } from "./PaymentProvider.js";

export type { PaymentProvider, CreatePaymentInput, CreatePaymentResult, WebhookEvent } from "./PaymentProvider.js";

/** Llaves de una pasarela para un negocio concreto (descifradas por el repo). */
export interface ResolvedPaymentCredentials {
  provider: string;
  publicKey: string;
  integritySecret: string;
  webhookSecret: string;
}

function requireConfig(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Falta configurar ${name} en las variables de entorno para procesar pagos (ver docs/PAYMENTS.md).`,
    );
  }
  return value;
}

/**
 * No cambiar de proveedor sin actualizar esta factory (sección 47). Cambiar
 * `PAYMENT_PROVIDER` implica escribir el adapter correspondiente, no acoplar
 * el resto de la aplicación a uno específico (sección 25).
 */
export function getPaymentProvider(): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case "wompi":
      return new WompiPaymentProvider({
        publicKey: requireConfig(env.PAYMENT_PUBLIC_KEY, "PAYMENT_PUBLIC_KEY"),
        integritySecret: requireConfig(env.PAYMENT_INTEGRITY_SECRET, "PAYMENT_INTEGRITY_SECRET"),
        eventsSecret: requireConfig(env.PAYMENT_WEBHOOK_SECRET, "PAYMENT_WEBHOOK_SECRET"),
      });
    case "mercadopago":
      throw new Error(
        "MercadoPagoPaymentProvider no está implementado todavía (Fase 0: Wompi fue el default elegido). " +
          "Ver docs/ARCHITECTURE.md.",
      );
  }
}

/**
 * Construye el provider con las credenciales de un negocio concreto
 * (docs/PANEL-OPERADOR.md §D3). El `switch` sobre `provider` sigue viviendo solo
 * aquí — el resto del backend depende únicamente de la interfaz `PaymentProvider`.
 */
export function getPaymentProviderForCredentials(creds: ResolvedPaymentCredentials): PaymentProvider {
  switch (creds.provider) {
    case "wompi":
      return new WompiPaymentProvider({
        publicKey: creds.publicKey,
        integritySecret: creds.integritySecret,
        eventsSecret: creds.webhookSecret,
      });
    default:
      throw new Error(`Proveedor de pago no soportado en PaymentCredentials: "${creds.provider}".`);
  }
}

/**
 * Lee la `reference` de un webhook entrante SIN validar la firma — necesario
 * para resolver a qué negocio pertenece antes de cargar sus credenciales y
 * recién ahí validar la firma con el secreto de ese comercio (§6.3).
 */
export function extractWebhookReference(rawPayload: unknown): string | null {
  // Hoy solo Wompi. Con un segundo proveedor, discriminar por forma del payload.
  return extractWompiReference(rawPayload);
}
