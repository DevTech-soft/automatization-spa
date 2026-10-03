import Link from "next/link";
import type { AuditLogRow, PaginatedResponse } from "@spa/shared";
import { AUDIT_ACTION_LABEL } from "@spa/shared";
import { Table, TD, TH, THead, TR, EmptyRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { adminGet } from "@/lib/backend";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

/**
 * Bitácora de acciones sensibles (docs/PANEL-OPERADOR.md §9): quién suspendió a
 * quién, quién tocó unas llaves, qué hizo el job de facturación. Solo lectura.
 */

type SearchParams = Promise<{ page?: string; action?: string; actor?: string }>;

/** Familias de acción para el filtro rápido; el backend filtra por prefijo. */
const ACTION_GROUPS = [
  { value: "", label: "Todo" },
  { value: "business.", label: "Negocios" },
  { value: "business.status", label: "Cambios de estado" },
  { value: "billing.", label: "Cartera" },
  { value: "whatsapp.", label: "WhatsApp" },
  { value: "payment.credentials", label: "Llaves de pago" },
];

/** Resumen legible de un `before`/`after` sin volcar el JSON entero. */
function summarize(value: unknown): string {
  if (!value || typeof value !== "object") return "—";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 3)
    .map(([key, v]) => `${key}: ${typeof v === "object" ? "…" : String(v)}`);
  return entries.length > 0 ? entries.join(" · ") : "—";
}

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const action = (sp.action ?? "").trim();

  const query = new URLSearchParams({ page: String(page), pageSize: "30" });
  if (action) query.set("action", action);

  const logs = await adminGet<PaginatedResponse<AuditLogRow>>(`/admin/audit-logs?${query}`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Bitácora"
        description="Todo cambio sensible queda registrado con actor, momento y valores. No se puede editar."
      />

      <form className="flex flex-wrap gap-2" action="/audit">
        <select
          name="action"
          defaultValue={action}
          className="h-9 rounded-[var(--radius)] border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm outline-none"
        >
          {ACTION_GROUPS.map((group) => (
            <option key={group.value || "all"} value={group.value}>
              {group.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-[var(--radius)] border border-[var(--color-border)] px-3 text-sm hover:bg-[var(--color-surface)]"
        >
          Filtrar
        </button>
      </form>

      <Table>
        <THead>
          <tr>
            <TH>Cuándo</TH>
            <TH>Acción</TH>
            <TH>Negocio</TH>
            <TH>Actor</TH>
            <TH>Cambio</TH>
          </tr>
        </THead>
        <tbody>
          {logs.items.length === 0 ? (
            <EmptyRow colSpan={5}>Sin registros con ese filtro.</EmptyRow>
          ) : (
            logs.items.map((log) => (
              <TR key={log.id}>
                <TD className="whitespace-nowrap text-[var(--color-fg-muted)]">
                  {formatDateTime(log.createdAt)}
                </TD>
                <TD>{AUDIT_ACTION_LABEL[log.action] ?? log.action}</TD>
                <TD>
                  {log.businessId ? (
                    <Link href={`/businesses/${log.businessId}`} className="hover:underline">
                      {log.businessName ?? "Negocio eliminado"}
                    </Link>
                  ) : (
                    <span className="text-[var(--color-fg-muted)]">—</span>
                  )}
                </TD>
                <TD className="text-xs text-[var(--color-fg-muted)]">
                  {log.actor === "system" ? "Automático" : log.actor}
                </TD>
                <TD className="max-w-xs truncate text-xs text-[var(--color-fg-muted)]" title={summarize(log.after)}>
                  {summarize(log.after)}
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>

      <Pagination data={logs} basePath="/audit" params={{ action: action || undefined }} />
    </div>
  );
}
