import type { ChatDetail, ChatThread, PaginatedResponse } from "@spa/shared";
import { AutoRefresh } from "@/components/auto-refresh";
import { ChatView } from "@/components/chat-view";
import { adminGet } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";

/**
 * Conversaciones de WhatsApp del negocio (F7): lo que escribieron las clientas
 * y lo que les contestó el bot, el agente o una notificación. Se refresca sola.
 */
export default async function PortalConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const phone = /^\d{6,20}$/.test(sp.phone ?? "") ? sp.phone! : null;

  const listQuery = new URLSearchParams({ page: String(page), pageSize: "30" });
  if (q) listQuery.set("q", q);
  const chatQuery = sp.before ? `?${new URLSearchParams({ before: sp.before })}` : "";

  const [threads, chat] = await Promise.all([
    adminGet<PaginatedResponse<ChatThread>>(`/portal/chats?${listQuery}`),
    phone ? adminGet<ChatDetail>(`/portal/chats/${phone}${chatQuery}`) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Conversaciones" description="Los mensajes de WhatsApp del negocio, en vivo. Solo lectura." />
      <ChatView
        threads={threads}
        chat={chat}
        basePath="/portal/conversations"
        q={q}
        page={page}
        customerHref="/portal/customers"
      />
      <AutoRefresh />
    </div>
  );
}
