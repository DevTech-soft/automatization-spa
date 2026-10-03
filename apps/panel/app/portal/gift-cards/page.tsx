import type { GiftCardRow, PaginatedResponse } from "@spa/shared";
import { GiftCardsTable } from "@/components/activity-tables";
import { adminGet } from "@/lib/backend";
import { ListToolbar, listQuery } from "../list-toolbar";
import { requireOwner } from "../owner-only";

export default async function PortalGiftCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireOwner();
  const sp = await searchParams;
  const { q, query, linkParams } = listQuery(sp);
  const data = await adminGet<PaginatedResponse<GiftCardRow>>(`/portal/gift-cards?${query}`);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Gift cards</h1>
      <ListToolbar action="/portal/gift-cards" q={q} placeholder="Código o nombre" />
      <GiftCardsTable data={data} basePath="/portal/gift-cards" params={linkParams} />
    </div>
  );
}
