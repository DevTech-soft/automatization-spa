import type { WhatsAppProvider } from "../integrations/whatsapp/index.js";
import {
  getWhatsAppProvider,
  getWhatsAppProviderForCredentials,
} from "../integrations/whatsapp/index.js";
import { whatsAppAccountRepository } from "../repositories/whatsAppAccount.repository.js";
import { logger } from "../utils/logger.js";

/**
 * Resuelve con qué credenciales se le contesta a la clienta de un negocio
 * (docs/PANEL-OPERADOR.md §7.2, F4).
 *
 * Orden:
 * 1. El número conectado al negocio (`whatsapp_accounts`, token cifrado). Es el
 *    camino definitivo: cada spa envía desde su propia WABA.
 * 2. Las env globales `WHATSAPP_*` del operador — el puente de §7.3, mientras
 *    Meta no aprueba el Embedded Signup y todos los clientes viven bajo la WABA
 *    del operador.
 *
 * Mismo patrón que `resolveProviderForBusiness` en pagos (F2): credencial
 * propia si existe, fallback global si no, y ninguna decisión de negocio aquí.
 */
export async function resolveWhatsAppProviderForBusiness(
  businessId: string,
): Promise<WhatsAppProvider> {
  const credentials = await whatsAppAccountRepository.findCredentialsByBusinessId(businessId);
  if (credentials) {
    return getWhatsAppProviderForCredentials(credentials);
  }

  logger.debug({ businessId }, "whatsapp_provider_fallback_to_env");
  return getWhatsAppProvider();
}
