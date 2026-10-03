import type {
  ChatDetail,
  ChatDetailQuery,
  ChatMessage,
  ChatThread,
  PaginatedResponse,
  PaginationQuery,
} from "@spa/shared";
import { paginate } from "@spa/shared";
import type { WhatsAppMessage } from "@spa/db";
import { whatsAppMessageRepository } from "../repositories/whatsAppMessage.repository.js";
import { adminBusinessRepository } from "../repositories/adminBusiness.repository.js";
import { NotFoundError } from "../errors/index.js";

/**
 * Lectura de la transcripción de WhatsApp (docs/PANEL-OPERADOR.md F7). La usan
 * el operador (`/admin/businesses/:id/chats`, tras verificar que el negocio
 * existe) y el portal (`/portal/chats`, con el negocio fijado por la sesión).
 * Siempre filtra por `businessId`: no hay chats "de todos los negocios".
 */

const MESSAGES_PER_PAGE = 100;

/** Para `/admin/*`, donde el negocio viene en la URL (en el portal lo fija la sesión). */
export async function assertBusinessExists(businessId: string): Promise<void> {
  if (!(await adminBusinessRepository.findDetail(businessId))) {
    throw new NotFoundError("Negocio no encontrado.");
  }
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : null;
}

function toChatMessage(row: WhatsAppMessage): ChatMessage {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    direction: row.direction,
    source: row.source,
    type: row.type,
    body: row.body,
    options: stringArray(payload["options"]),
    url: typeof payload["url"] === "string" ? payload["url"] : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listChats(
  businessId: string,
  query: PaginationQuery,
): Promise<PaginatedResponse<ChatThread>> {
  const rows = await whatsAppMessageRepository.listThreads(businessId, {
    q: query.q,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

  const items: ChatThread[] = rows.map((row) => ({
    phone: row.phone,
    displayName: row.customerName ?? row.contactName,
    customerId: row.customerId,
    lastBody: row.lastBody,
    lastDirection: row.lastDirection,
    lastSource: row.lastSource,
    lastMessageAt: row.lastMessageAt.toISOString(),
    messageCount: row.messageCount,
    conversationState: row.conversationState,
  }));

  // `total` viene en cada fila (`COUNT(*) OVER()`); una página vacía más allá
  // del final no lo trae, y ahí 0 basta para que el panel no ofrezca seguir.
  return paginate(items, rows[0]?.total ?? 0, query);
}

export async function getChat(businessId: string, phone: string, query: ChatDetailQuery): Promise<ChatDetail> {
  const [rows, context] = await Promise.all([
    whatsAppMessageRepository.listMessages(businessId, phone, {
      before: query.before ? new Date(query.before) : undefined,
      // Uno de más para saber si quedan anteriores sin otra consulta.
      take: MESSAGES_PER_PAGE + 1,
    }),
    whatsAppMessageRepository.findThreadContext(businessId, phone),
  ]);

  const hasMore = rows.length > MESSAGES_PER_PAGE;
  const page = rows.slice(0, MESSAGES_PER_PAGE).reverse();

  return {
    phone,
    displayName: context.customer?.name ?? context.contactName,
    contactName: context.contactName,
    customerId: context.customer?.id ?? null,
    messages: page.map(toChatMessage),
    hasMore,
    nextBefore: hasMore && page[0] ? page[0].createdAt.toISOString() : null,
  };
}
