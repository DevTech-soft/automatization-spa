import { prisma } from "../db/prisma.js";
import { digitsOnly } from "../utils/phone.js";

/**
 * NOTA (F1 — docs/PANEL-OPERADOR.md §5): estos finders ya NO filtran por
 * `active`/`status`. Decidir si el negocio atiende es responsabilidad del guard
 * (`assertBusinessOperational` en las superficies HTTP, la suspensión suave en
 * WhatsApp), aplicado en cada puerta de entrada. Filtrar aquí escondía el
 * negocio y devolvía 404 para todos los estados no operativos.
 */
export const businessRepository = {
  findBySlug(slug: string) {
    return prisma.business.findUnique({ where: { slug } });
  },

  findById(id: string) {
    return prisma.business.findUnique({ where: { id } });
  },

  /**
   * Resuelve el negocio dueño de un número de WhatsApp comparando solo dígitos
   * (Meta y el dato sembrado pueden diferir en el "+" inicial). Camino legacy:
   * F4 (Embedded Signup) mueve la resolución a `phone_number_id` vía
   * `whatsAppAccountRepository`; este método queda como fallback.
   */
  async findByWhatsAppNumber(phone: string) {
    const target = digitsOnly(phone);
    const candidates = await prisma.business.findMany({
      where: { whatsappNumber: { not: null } },
    });
    return candidates.find((business) => digitsOnly(business.whatsappNumber ?? "") === target) ?? null;
  },
};
