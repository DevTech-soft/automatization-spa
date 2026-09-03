import { prisma } from "../db/prisma.js";

export const whatsAppAccountRepository = {
  /**
   * Resuelve el negocio por el `phone_number_id` estable de Meta — la llave que
   * el webhook multi-WABA debe usar (docs/PANEL-OPERADOR.md §7.2). F4 (Embedded
   * Signup) puebla `whatsapp_accounts`; hasta entonces no hay filas y el webhook
   * cae al lookup por número (`businessRepository.findByWhatsAppNumber`).
   */
  async findBusinessByPhoneNumberId(phoneNumberId: string) {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { phoneNumberId },
      include: { business: true },
    });
    return account?.business ?? null;
  },
};
