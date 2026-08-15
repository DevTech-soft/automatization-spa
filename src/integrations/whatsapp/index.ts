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
