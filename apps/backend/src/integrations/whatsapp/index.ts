import { env } from "../../config/env.js";
import { MetaWhatsAppProvider } from "./MetaWhatsAppProvider.js";
import type { WhatsAppProvider } from "./WhatsAppProvider.js";

export type {
  WhatsAppProvider,
  IncomingWhatsAppMessage,
  InteractiveMessage,
  InteractiveButton,
  InteractiveListSection,
  InteractiveListRow,
} from "./WhatsAppProvider.js";

function requireConfig(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Falta configurar ${name} en las variables de entorno para usar WhatsApp (ver docs/WHATSAPP.md).`);
  }
  return value;
}

/** Único punto que instancia un WhatsAppProvider concreto (sección 26 y 47). */
export function getWhatsAppProvider(): WhatsAppProvider {
  return new MetaWhatsAppProvider({
    accessToken: requireConfig(env.WHATSAPP_ACCESS_TOKEN, "WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: requireConfig(env.WHATSAPP_PHONE_NUMBER_ID, "WHATSAPP_PHONE_NUMBER_ID"),
    appSecret: env.WHATSAPP_APP_SECRET || undefined,
  });
}

/**
 * Provider para lo que ocurre **antes** de saber de qué negocio es un mensaje:
 * validar la firma del webhook y parsear el payload. Ninguna de esas dos
 * operaciones envía nada, así que no necesita token ni `phone_number_id` — y
 * exigirlos rompería un despliegue multi-cliente donde las credenciales viven
 * por negocio y no en env (docs/PANEL-OPERADOR.md §7.2).
 *
 * La firma sí usa el `WHATSAPP_APP_SECRET`, que es de **la app** del operador y
 * por tanto sigue siendo único para todas las WABAs conectadas.
 */
export function getWhatsAppWebhookReader(): WhatsAppProvider {
  return new MetaWhatsAppProvider({
    accessToken: "",
    phoneNumberId: "",
    appSecret: env.WHATSAPP_APP_SECRET || undefined,
  });
}

/** Credenciales de la WABA de un negocio, ya descifradas por el repositorio. */
export interface ResolvedWhatsAppCredentials {
  accessToken: string;
  phoneNumberId: string;
}

/**
 * Provider con las credenciales de un negocio concreto (docs/PANEL-OPERADOR.md
 * §7.2, F4): el envío sale del número del cliente, no del número global del
 * operador.
 *
 * El `appSecret` sigue siendo único: la firma `X-Hub-Signature-256` de los
 * webhooks la calcula Meta con el secreto de **la app** del operador, que es la
 * misma para todas las WABAs conectadas.
 */
export function getWhatsAppProviderForCredentials(
  creds: ResolvedWhatsAppCredentials,
): WhatsAppProvider {
  return new MetaWhatsAppProvider({
    accessToken: creds.accessToken,
    phoneNumberId: creds.phoneNumberId,
    appSecret: env.WHATSAPP_APP_SECRET || undefined,
  });
}
