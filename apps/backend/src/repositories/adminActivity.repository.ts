import type { Prisma } from "@spa/db";
import { prisma } from "../db/prisma.js";

/**
 * Listados de actividad de un negocio para el panel: citas, pagos,
 * conversaciones y gift cards. Todos paginados server-side (§D10) y siempre
 * filtrados por `businessId` — es el mismo filtro de tenant que usará el portal
 * del cliente en F7, así que aquí nunca se consulta "todas las citas".
 */

const APPOINTMENT_INCLUDE = {
  service: { select: { name: true } },
  customer: { select: { name: true, phone: true } },
} satisfies Prisma.AppointmentInclude;

const CONVERSATION_INCLUDE = {
  service: { select: { name: true } },
} satisfies Prisma.WhatsAppConversationInclude;

export type AdminAppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>;
export type AdminConversationRow = Prisma.WhatsAppConversationGetPayload<{
  include: typeof CONVERSATION_INCLUDE;
}>;

interface Page {
  skip: number;
  take: number;
}

export const adminActivityRepository = {
  async listAppointments(
    where: Prisma.AppointmentWhereInput,
    { skip, take }: Page,
    /** `asc` para una agenda (lo próximo primero); `desc` para el historial. */
    order: Prisma.SortOrder = "desc",
  ): Promise<{ rows: AdminAppointmentRow[]; total: number }> {
    const [rows, total] = await prisma.$transaction([
      prisma.appointment.findMany({
        where,
        orderBy: [{ appointmentDate: order }, { startTime: order }],
        skip,
        take,
        include: APPOINTMENT_INCLUDE,
      }),
      prisma.appointment.count({ where }),
    ]);
    return { rows, total };
  },

  async listPayments(where: Prisma.PaymentWhereInput, { skip, take }: Page) {
    const [rows, total] = await prisma.$transaction([
      prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.payment.count({ where }),
    ]);
    return { rows, total };
  },

  async listConversations(
    where: Prisma.WhatsAppConversationWhereInput,
    { skip, take }: Page,
  ): Promise<{ rows: AdminConversationRow[]; total: number }> {
    const [rows, total] = await prisma.$transaction([
      prisma.whatsAppConversation.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
        include: CONVERSATION_INCLUDE,
      }),
      prisma.whatsAppConversation.count({ where }),
    ]);
    return { rows, total };
  },

  async listGiftCards(where: Prisma.GiftCardWhereInput, { skip, take }: Page) {
    const [rows, total] = await prisma.$transaction([
      prisma.giftCard.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.giftCard.count({ where }),
    ]);
    return { rows, total };
  },
};
