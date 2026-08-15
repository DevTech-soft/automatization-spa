import { prisma } from "../db/prisma.js";
import { digitsOnly } from "../utils/phone.js";

export const businessRepository = {
  findBySlug(slug: string) {
    return prisma.business.findFirst({ where: { slug, active: true } });
  },

  findById(id: string) {
    return prisma.business.findFirst({ where: { id, active: true } });
  },

  /**
   * Resuelve el negocio dueño de un número de WhatsApp (sección 5: multi-tenant
   * por diseño — cada negocio tendrá su propio `whatsapp_number`). Compara solo
   * dígitos porque Meta y el dato sembrado pueden diferir en el "+" inicial.
   */
  async findByWhatsAppNumber(phone: string) {
    const target = digitsOnly(phone);
    const candidates = await prisma.business.findMany({
      where: { active: true, whatsappNumber: { not: null } },
    });
    return candidates.find((business) => digitsOnly(business.whatsappNumber ?? "") === target) ?? null;
  },
};
