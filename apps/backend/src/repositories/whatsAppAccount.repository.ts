import type { Prisma, WhatsAppAccount, WhatsAppOnboardingSource } from "@spa/db";
import { prisma } from "../db/prisma.js";
import { decryptSecret, encryptSecret } from "../utils/crypto.js";

/**
 * Cuentas de WhatsApp (WABA) por negocio — docs/PANEL-OPERADOR.md §7.
 *
 * El `accessToken` se guarda cifrado (AES-256-GCM, §9) igual que las llaves de
 * Wompi: el resto del backend nunca ve el texto en reposo. Solo
 * `findCredentialsByBusinessId` lo descifra, para que el `MetaWhatsAppProvider`
 * pueda enviar mensajes con las credenciales del negocio dueño del número.
 */

export interface WhatsAppCredentials {
  accountId: string;
  businessId: string;
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}

export interface UpsertWhatsAppAccountInput {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string | null;
  displayName?: string | null;
  accessToken: string;
  /** Solo lo manda el Embedded Signup (§7.4); el alta manual deja el default MANUAL. */
  onboardingSource?: WhatsAppOnboardingSource;
  businessPortfolioId?: string | null;
  /** PIN de dos pasos en claro; se cifra acá, igual que el token. */
  registrationPin?: string | null;
  registeredAt?: Date | null;
  subscriptionStatus?: string | null;
  qualityRating?: string | null;
  messagingLimit?: string | null;
}

export const whatsAppAccountRepository = {
  /**
   * Resuelve el negocio por el `phone_number_id` estable de Meta — la llave que
   * el webhook multi-WABA debe usar (§7.2). Cuando no hay fila (número no
   * conectado todavía), el webhook cae al lookup por número
   * (`businessRepository.findByWhatsAppNumber`).
   */
  async findBusinessByPhoneNumberId(phoneNumberId: string) {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { phoneNumberId },
      include: { business: true },
    });
    return account?.business ?? null;
  },

  /**
   * Credenciales del número **activo** de un negocio, descifradas. Es lo que
   * consume `resolveWhatsAppProviderForBusiness` antes de enviar un mensaje; si
   * devuelve `null` el envío cae a las env globales del operador (puente §7.3).
   *
   * Con varios números conectados gana el más reciente: hoy el modelo no tiene
   * un "número principal" y ningún negocio real usa más de uno.
   */
  async findCredentialsByBusinessId(businessId: string): Promise<WhatsAppCredentials | null> {
    const account = await prisma.whatsAppAccount.findFirst({
      where: { businessId, active: true },
      orderBy: { createdAt: "desc" },
    });
    if (!account) {
      return null;
    }
    return {
      accountId: account.id,
      businessId: account.businessId,
      wabaId: account.wabaId,
      phoneNumberId: account.phoneNumberId,
      accessToken: decryptSecret(account.accessTokenEnc),
    };
  },

  listByBusiness(businessId: string): Promise<WhatsAppAccount[]> {
    return prisma.whatsAppAccount.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } });
  },

  find(id: string): Promise<WhatsAppAccount | null> {
    return prisma.whatsAppAccount.findUnique({ where: { id } });
  },

  findByPhoneNumberId(phoneNumberId: string): Promise<WhatsAppAccount | null> {
    return prisma.whatsAppAccount.findUnique({ where: { phoneNumberId } });
  },

  /**
   * Conecta (o reconecta) un número a un negocio. La llave natural es
   * `phoneNumberId`: si Meta devuelve el mismo número para otro negocio, esto
   * lo reasigna en vez de crear una fila huérfana que rompería el webhook.
   */
  connect(businessId: string, input: UpsertWhatsAppAccountInput): Promise<WhatsAppAccount> {
    const data = {
      businessId,
      wabaId: input.wabaId,
      displayPhoneNumber: input.displayPhoneNumber ?? null,
      displayName: input.displayName ?? null,
      accessTokenEnc: encryptSecret(input.accessToken),
      active: true,
      // Los campos del Embedded Signup son opcionales: en el alta manual no se
      // tocan, y reconectar por el panel un número que vino del signup no debe
      // borrar su PIN ni fingir que se dio de alta a mano.
      ...(input.onboardingSource ? { onboardingSource: input.onboardingSource } : {}),
      ...(input.businessPortfolioId !== undefined
        ? { businessPortfolioId: input.businessPortfolioId }
        : {}),
      ...(input.registrationPin
        ? { registrationPinEnc: encryptSecret(input.registrationPin) }
        : {}),
      ...(input.registeredAt !== undefined ? { registeredAt: input.registeredAt } : {}),
      ...(input.subscriptionStatus !== undefined
        ? { subscriptionStatus: input.subscriptionStatus }
        : {}),
      ...(input.qualityRating !== undefined ? { qualityRating: input.qualityRating } : {}),
      ...(input.messagingLimit !== undefined ? { messagingLimit: input.messagingLimit } : {}),
    };
    return prisma.whatsAppAccount.upsert({
      where: { phoneNumberId: input.phoneNumberId },
      create: { ...data, phoneNumberId: input.phoneNumberId },
      update: data,
    });
  },

  update(id: string, data: Prisma.WhatsAppAccountUpdateInput): Promise<WhatsAppAccount> {
    return prisma.whatsAppAccount.update({ where: { id }, data });
  },

  /** Rota el token de un número ya conectado. */
  setAccessToken(id: string, accessToken: string): Promise<WhatsAppAccount> {
    return prisma.whatsAppAccount.update({
      where: { id },
      data: { accessTokenEnc: encryptSecret(accessToken) },
    });
  },

  delete(id: string): Promise<WhatsAppAccount> {
    return prisma.whatsAppAccount.delete({ where: { id } });
  },

  countActive(businessId: string): Promise<number> {
    return prisma.whatsAppAccount.count({ where: { businessId, active: true } });
  },
};
