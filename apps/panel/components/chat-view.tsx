import Link from "next/link";
import { ChevronLeft, FileText } from "lucide-react";
import type { ChatDetail, ChatMessage, ChatMessageSource, ChatThread, PaginatedResponse } from "@spa/shared";
import { Pagination } from "@/components/pagination";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Transcripción de WhatsApp (docs/PANEL-OPERADOR.md F7): lista de hilos a la
 * izquierda, chat a la derecha. La comparten el operador (pestaña
 * Conversaciones del negocio) y el portal del spa. Todo va por URL
 * (`?phone=&q=&page=&before=`) para que cada chat sea enlazable; el "en vivo"
 * es un `AutoRefresh` en la página.
 *
 * Solo lectura: responder desde aquí no existe todavía (necesita la ventana de
 * 24 h de Meta y plantillas fuera de ella).
 */

const SOURCE_LABEL: Record<ChatMessageSource, string> = {
  CUSTOMER: "Clienta",
  BOT: "Bot",
  AGENT: "Agente",
  NOTIFICATION: "Notificación",
};

function threadLabel(thread: { displayName: string | null; phone: string }) {
  return thread.displayName ?? `+${thread.phone}`;
}

function href(basePath: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function ChatView({
  threads,
  chat,
  basePath,
  q,
  page,
  customerHref,
}: {
  threads: PaginatedResponse<ChatThread>;
  chat: ChatDetail | null;
  basePath: string;
  q: string;
  page: number;
  /** Prefijo de la ficha de clienta (`/portal/customers`); sin él no se enlaza. */
  customerHref?: string;
}) {
  const listParams = { q: q || undefined, page: page > 1 ? String(page) : undefined };

  return (
    <div className="grid min-h-[32rem] overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] md:grid-cols-[20rem_1fr]">
      <aside
        className={cn(
          "flex min-h-0 flex-col border-[var(--color-border)] md:border-r",
          chat ? "hidden md:flex" : "flex",
        )}
      >
        <form action={basePath} className="border-b border-[var(--color-border)] p-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre o teléfono"
            aria-label="Buscar conversación"
            className="h-9 w-full rounded-[var(--radius)] border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm outline-none focus-visible:border-[var(--color-ring)]"
          />
        </form>
        {threads.items.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--color-fg-muted)]">
            {q ? "Nada coincide con la búsqueda." : "Todavía no hay mensajes de WhatsApp."}
          </p>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-[var(--color-border)] overflow-y-auto">
            {threads.items.map((thread) => {
              const active = chat?.phone === thread.phone;
              return (
                <li key={thread.phone}>
                  <Link
                    href={href(basePath, { ...listParams, phone: thread.phone })}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex flex-col gap-0.5 px-4 py-3 text-sm hover:bg-[var(--color-surface)]",
                      active && "bg-[var(--color-surface)]",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{threadLabel(thread)}</span>
                      <span className="shrink-0 text-xs text-[var(--color-fg-muted)]">
                        {formatDateTime(thread.lastMessageAt)}
                      </span>
                    </span>
                    <span className="truncate text-[var(--color-fg-muted)]">
                      {thread.lastDirection === "OUTBOUND" ? `${SOURCE_LABEL[thread.lastSource]}: ` : ""}
                      {thread.lastBody}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t border-[var(--color-border)] px-3 empty:hidden">
          <Pagination data={threads} basePath={basePath} params={{ q: q || undefined }} />
        </div>
      </aside>

      <section className={cn("min-h-0 flex-col", chat ? "flex" : "hidden md:flex")}>
        {chat ? (
          <ChatPane chat={chat} basePath={basePath} listParams={listParams} customerHref={customerHref} />
        ) : (
          <p className="m-auto p-6 text-sm text-[var(--color-fg-muted)]">
            Elige una conversación para ver los mensajes.
          </p>
        )}
      </section>
    </div>
  );
}

function ChatPane({
  chat,
  basePath,
  listParams,
  customerHref,
}: {
  chat: ChatDetail;
  basePath: string;
  listParams: Record<string, string | undefined>;
  customerHref?: string | undefined;
}) {
  return (
    <>
      <header className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <Link
          href={href(basePath, listParams)}
          className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] md:hidden"
          aria-label="Volver a la lista"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <p className="truncate font-medium">
            {customerHref && chat.customerId ? (
              <Link href={`${customerHref}/${chat.customerId}`} className="hover:underline">
                {threadLabel(chat)}
              </Link>
            ) : (
              threadLabel(chat)
            )}
          </p>
          <p className="text-xs text-[var(--color-fg-muted)]">
            <a href={`https://wa.me/${chat.phone}`} target="_blank" rel="noreferrer" className="hover:underline">
              +{chat.phone}
            </a>
            {chat.contactName && chat.contactName !== chat.displayName ? ` · perfil: ${chat.contactName}` : ""}
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-[var(--color-surface)] p-4">
        {chat.hasMore && chat.nextBefore ? (
          <Link
            href={href(basePath, { ...listParams, phone: chat.phone, before: chat.nextBefore })}
            className="self-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-xs hover:underline"
          >
            Ver mensajes anteriores
          </Link>
        ) : null}
        {chat.messages.length === 0 ? (
          <p className="m-auto text-sm text-[var(--color-fg-muted)]">Sin mensajes.</p>
        ) : (
          chat.messages.map((message) => <Bubble key={message.id} message={message} />)
        )}
      </div>
    </>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const outbound = message.direction === "OUTBOUND";
  const unsupported = !outbound && message.type !== "text" && message.type !== "interactive_reply";

  return (
    <div className={cn("flex max-w-[85%] flex-col gap-1", outbound ? "self-end items-end" : "self-start items-start")}>
      <div
        className={cn(
          "whitespace-pre-line break-words rounded-2xl px-3 py-2 text-sm",
          outbound
            ? "rounded-br-sm bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
            : "rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-background)]",
          unsupported && "italic text-[var(--color-fg-muted)]",
        )}
      >
        {message.type === "document" && message.url ? (
          <a href={message.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 underline">
            <FileText className="size-4 shrink-0" />
            {message.body}
          </a>
        ) : (
          message.body
        )}
        {message.options && message.options.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1">
            {message.options.map((option, i) => (
              <li
                key={`${option}-${i}`}
                className="rounded-full bg-white/20 px-2 py-0.5 text-xs not-italic"
              >
                {option}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <span className="text-[11px] text-[var(--color-fg-muted)]">
        {outbound ? `${SOURCE_LABEL[message.source]} · ` : ""}
        {formatDateTime(message.createdAt)}
      </span>
    </div>
  );
}

