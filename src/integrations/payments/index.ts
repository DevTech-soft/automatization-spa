import { env } from "../../config/env.js";
import { WompiPaymentProvider } from "./WompiPaymentProvider.js";
import type { PaymentProvider } from "./PaymentProvider.js";

export type { PaymentProvider, CreatePaymentInput, CreatePaymentResult, WebhookEvent } from "./PaymentProvider.js";

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
