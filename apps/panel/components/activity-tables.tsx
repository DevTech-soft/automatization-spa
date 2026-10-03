import type {
  AppointmentRow,
  ConversationRow,
  GiftCardRow,
  PaginatedResponse,
  PaymentRow,
} from "@spa/shared";
import { StateBadge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR, EmptyRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

/**
 * Tablas de actividad de un negocio (citas, pagos, conversaciones, gift cards).
 * Las comparten la pestaña Actividad del operador y el portal del cliente (F7):
 * pintan los mismos DTOs de `@spa/shared`.
 */

interface TableProps<T> {
  data: PaginatedResponse<T>;
  basePath: string;
  params: Record<string, string | undefined>;
  /** Texto de la tabla vacía, si el genérico no aplica (p. ej. "Sin citas esta semana"). */
  emptyText?: string;
}

export function AppointmentsTable({ data, basePath, params, emptyText }: TableProps<AppointmentRow>) {
  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH>Fecha</TH>
            <TH>Clienta</TH>
            <TH>Servicio</TH>
            <TH>Origen</TH>
            <TH>Estado</TH>
            <TH className="text-right">Valor</TH>
          </tr>
        </THead>
        <tbody>
          {data.items.length === 0 ? (
            <EmptyRow colSpan={6}>{emptyText ?? "Sin citas en este negocio."}</EmptyRow>
          ) : (
            data.items.map((row) => (
              <TR key={row.id}>
                <TD>
                  <span className="block">{formatDate(row.date)}</span>
                  <span className="text-xs text-[var(--color-fg-muted)]">
                    {row.startTime}–{row.endTime}
                  </span>
                </TD>
                <TD>
                  <span className="block">{row.customerName}</span>
                  <span className="font-mono text-xs text-[var(--color-fg-muted)]">
                    {row.customerPhone ?? "—"}
                  </span>
                </TD>
                <TD>{row.serviceName}</TD>
                <TD>
                  <StateBadge value={row.source} />
                </TD>
                <TD className="space-y-1">
                  <StateBadge value={row.status} />
                  <div>
                    <StateBadge value={row.paymentStatus} />
                  </div>
                </TD>
                <TD className="text-right tabular-nums">
                  <span className="block">{formatMoney(row.price)}</span>
                  {row.depositAmount != null ? (
                    <span className="text-xs text-[var(--color-fg-muted)]">
                      abono {formatMoney(row.depositAmount)} · saldo{" "}
                      {formatMoney(row.pendingBalance ?? 0)}
                    </span>
                  ) : null}
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
      <Pagination data={data} basePath={basePath} params={params} />
    </>
  );
}

export function PaymentsTable({ data, basePath, params }: TableProps<PaymentRow>) {
  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH>Referencia</TH>
            <TH>Concepto</TH>
            <TH>Estado</TH>
            <TH>Actualizado</TH>
            <TH className="text-right">Monto</TH>
          </tr>
        </THead>
        <tbody>
          {data.items.length === 0 ? (
            <EmptyRow colSpan={5}>Sin pagos registrados.</EmptyRow>
          ) : (
            data.items.map((row) => (
              <TR key={row.id}>
                <TD className="font-mono text-xs">{row.reference}</TD>
                <TD>
                  <StateBadge value={row.entityType} />
                </TD>
                <TD>
                  <StateBadge value={row.status} />
                </TD>
                <TD className="text-[var(--color-fg-muted)]">{formatDateTime(row.updatedAt)}</TD>
                <TD className="text-right tabular-nums">{formatMoney(row.amount, row.currency)}</TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
      <Pagination data={data} basePath={basePath} params={params} />
    </>
  );
}

export function ConversationsTable({ data, basePath, params }: TableProps<ConversationRow>) {
  return (
    <>
      <p className="text-sm text-[var(--color-fg-muted)]">
        En qué punto quedó cada conversación del bot de menús. Los mensajes están en la pestaña
        Conversaciones.
      </p>
      <Table>
        <THead>
          <tr>
            <TH>Teléfono</TH>
            <TH>Clienta</TH>
            <TH>Estado</TH>
            <TH>Eligió</TH>
            <TH>Último turno</TH>
          </tr>
        </THead>
        <tbody>
          {data.items.length === 0 ? (
            <EmptyRow colSpan={5}>Sin conversaciones registradas.</EmptyRow>
          ) : (
            data.items.map((row) => (
              <TR key={row.id}>
                <TD className="font-mono text-xs">{row.phone}</TD>
                <TD>{row.customerName ?? "—"}</TD>
                <TD>
                  <StateBadge value={row.state} />
                </TD>
                <TD className="text-[var(--color-fg-muted)]">
                  {row.serviceName ?? "—"}
                  {row.date ? (
                    <span className="block text-xs">
                      {formatDate(row.date)} {row.startTime ?? ""}
                    </span>
                  ) : null}
                </TD>
                <TD className="text-[var(--color-fg-muted)]">{formatDateTime(row.updatedAt)}</TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
      <Pagination data={data} basePath={basePath} params={params} />
    </>
  );
}

export function GiftCardsTable({ data, basePath, params }: TableProps<GiftCardRow>) {
  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH>Código</TH>
            <TH>Compró</TH>
            <TH>Para</TH>
            <TH>Estado</TH>
            <TH className="text-right">Valor</TH>
          </tr>
        </THead>
        <tbody>
          {data.items.length === 0 ? (
            <EmptyRow colSpan={5}>Sin gift cards.</EmptyRow>
          ) : (
            data.items.map((row) => (
              <TR key={row.id}>
                <TD className="font-mono text-xs">{row.code}</TD>
                <TD>{row.buyerName}</TD>
                <TD>{row.recipientName}</TD>
                <TD className="space-y-1">
                  <StateBadge value={row.status} />
                  {row.redeemedAt ? (
                    <span className="block text-xs text-[var(--color-fg-muted)]">
                      redimida {formatDateTime(row.redeemedAt)}
                    </span>
                  ) : null}
                </TD>
                <TD className="text-right tabular-nums">{formatMoney(row.amount)}</TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
      <Pagination data={data} basePath={basePath} params={params} />
    </>
  );
}
