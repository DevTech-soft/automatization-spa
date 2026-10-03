import type { ConversationRow, PaginatedResponse } from "@spa/shared";
import { ConversationsTable } from "@/components/activity-tables";
import { adminGet } from "@/lib/backend";
import { ListToolbar, listQuery } from "../list-toolbar";

export default async function PortalConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { q, query, linkParams } = listQuery(sp);
  const data = await adminGet<PaginatedResponse<ConversationRow>>(`/portal/conversations?${query}`);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Conversaciones del bot</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Quién le escribió al WhatsApp del negocio y en qué paso de la reserva quedó.
        </p>
      </div>
      <ListToolbar action="/portal/conversations" q={q} placeholder="Teléfono o nombre" />
      <ConversationsTable data={data} basePath="/portal/conversations" params={linkParams} />
    </div>
  );
}
