import type { ConversationState, Prisma } from "@spa/db";
import { prisma } from "../db/prisma.js";

export const whatsappConversationRepository = {
  findActive(businessId: string, phone: string) {
    return prisma.whatsAppConversation.findUnique({
      where: { businessId_phone: { businessId, phone } },
    });
  },

  /** Crea la conversación en el estado inicial si no existe todavía. */
  createInitial(businessId: string, phone: string) {
    return prisma.whatsAppConversation.create({
      data: { businessId, phone, state: "SELECTING_SERVICE" },
    });
  },

  update(id: string, data: Prisma.WhatsAppConversationUncheckedUpdateInput) {
    return prisma.whatsAppConversation.update({ where: { id }, data });
  },

  /** Reinicia la conversación al estado inicial, limpiando la selección previa. */
  reset(id: string, state: ConversationState = "SELECTING_SERVICE") {
    return prisma.whatsAppConversation.update({
      where: { id },
      data: {
        state,
        serviceId: null,
        date: null,
        startTime: null,
        customerName: null,
        appointmentId: null,
      },
    });
  },
};
