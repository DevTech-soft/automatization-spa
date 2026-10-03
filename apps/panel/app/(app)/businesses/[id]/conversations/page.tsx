import type { ChatDetail, ChatThread, PaginatedResponse } from "@spa/shared";
import { AutoRefresh } from "@/components/auto-refresh";
import { ChatView } from "@/components/chat-view";
import { adminGet } from "@/lib/backend";

/**
 * Transcripción de WhatsApp del negocio (F7), la misma que ve el spa en su
 * portal. Sirve de soporte: qué le dijo el bot a una clienta que se quejó.
 */
export default async function BusinessConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const phone = /^\d{6,20}$/.test(sp.phone ?? "") ? sp.phone! : null;

  const listQuery = new URLSearchParams({ page: String(page), pageSize: "30" });
  if (q) listQuery.set("q", q);
  const chatQuery = sp.before ? `?${new URLSearchParams({ before: sp.before })}` : "";

  const [threads, chat] = await Promise.all([
    adminGet<PaginatedResponse<ChatThread>>(`/admin/businesses/${id}/chats?${listQuery}`),
    phone ? adminGet<ChatDetail>(`/admin/businesses/${id}/chats/${phone}${chatQuery}`) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <ChatView threads={threads} chat={chat} basePath={`/businesses/${id}/conversations`} q={q} page={page} />
      <AutoRefresh />
    </div>
  );
}
