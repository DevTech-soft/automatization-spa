import { Prisma, type WhatsAppMessage } from "@spa/db";
import { prisma } from "../db/prisma.js";

/**
 * Transcripción de WhatsApp (docs/PANEL-OPERADOR.md F7). Solo escritura desde
 * el webhook y los envíos; lectura desde el panel y el portal.
 */

export interface ThreadRow {
  phone: string;
  lastBody: string;
  lastDirection: "INBOUND" | "OUTBOUND";
  lastSource: "CUSTOMER" | "BOT" | "AGENT" | "NOTIFICATION";
  lastMessageAt: Date;
  messageCount: number;
  contactName: string | null;
  customerId: string | null;
  customerName: string | null;
  conversationState: string | null;
  total: number;
}

export const whatsAppMessageRepository = {
  /**
   * Devuelve `null` si el `wa_message_id` ya existía: Meta reintenta el webhook
   * cuando no recibe el 200 a tiempo y el mismo mensaje llega dos veces.
   */
  async create(data: Prisma.WhatsAppMessageUncheckedCreateInput): Promise<WhatsAppMessage | null> {
    try {
      return await prisma.whatsAppMessage.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return null;
      }
      throw error;
    }
  },

  /**
   * Un hilo por número, el más reciente primero. Cruza con `customers` (nombre
   * real si ya reservó) y `whatsapp_conversations` (en qué paso del bot va).
   * Los teléfonos se comparan solo por dígitos: Meta los manda sin "+", la web
   * a veces con.
   */
  async listThreads(
    businessId: string,
    options: { q?: string | undefined; skip: number; take: number },
  ): Promise<ThreadRow[]> {
    const search = options.q
      ? Prisma.sql`WHERE t.phone LIKE ${`%${options.q.replace(/\D/g, "") || options.q}%`}
          OR t.contact_name ILIKE ${`%${options.q}%`}
          OR c.name ILIKE ${`%${options.q}%`}`
      : Prisma.empty;

    return prisma.$queryRaw<ThreadRow[]>`
      WITH threads AS (
        SELECT DISTINCT ON (m.phone)
          m.phone,
          m.body AS last_body,
          m.direction AS last_direction,
          m.source AS last_source,
          m.created_at AS last_message_at
        FROM whatsapp_messages m
        WHERE m.business_id = ${businessId}
        ORDER BY m.phone, m.created_at DESC
      ),
      stats AS (
        SELECT
          m.phone,
          COUNT(*)::int AS message_count,
          (ARRAY_AGG(m.contact_name ORDER BY m.created_at DESC)
            FILTER (WHERE m.contact_name IS NOT NULL))[1] AS contact_name
        FROM whatsapp_messages m
        WHERE m.business_id = ${businessId}
        GROUP BY m.phone
      )
      SELECT
        th.phone,
        th.last_body AS "lastBody",
        th.last_direction::text AS "lastDirection",
        th.last_source::text AS "lastSource",
        th.last_message_at AS "lastMessageAt",
        t.message_count AS "messageCount",
        t.contact_name AS "contactName",
        c.id AS "customerId",
        c.name AS "customerName",
        wc.state::text AS "conversationState",
        COUNT(*) OVER()::int AS total
      FROM threads th
      JOIN stats t ON t.phone = th.phone
      LEFT JOIN LATERAL (
        SELECT id, name FROM customers
        WHERE business_id = ${businessId}
          AND regexp_replace(phone, '[^0-9]', '', 'g') = th.phone
        LIMIT 1
      ) c ON TRUE
      LEFT JOIN whatsapp_conversations wc
        ON wc.business_id = ${businessId}
        AND regexp_replace(wc.phone, '[^0-9]', '', 'g') = th.phone
      ${search}
      ORDER BY th.last_message_at DESC
      OFFSET ${options.skip}
      LIMIT ${options.take}
    `;
  },

  /** Los `take` más recientes antes de `before`, del más nuevo al más viejo. */
  listMessages(
    businessId: string,
    phone: string,
    options: { before?: Date | undefined; take: number },
  ): Promise<WhatsAppMessage[]> {
    return prisma.whatsAppMessage.findMany({
      where: {
        businessId,
        phone,
        ...(options.before ? { createdAt: { lt: options.before } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: options.take,
    });
  },

  /** Nombre y estado del hilo, para el encabezado del chat. */
  async findThreadContext(businessId: string, phone: string) {
    const [lastNamed, customers] = await Promise.all([
      prisma.whatsAppMessage.findFirst({
        where: { businessId, phone, contactName: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { contactName: true },
      }),
      prisma.$queryRaw<{ id: string; name: string }[]>`
        SELECT id, name FROM customers
        WHERE business_id = ${businessId}
          AND regexp_replace(phone, '[^0-9]', '', 'g') = ${phone}
        LIMIT 1
      `,
    ]);
    return {
      contactName: lastNamed?.contactName ?? null,
      customer: customers[0] ?? null,
    };
  },
};
