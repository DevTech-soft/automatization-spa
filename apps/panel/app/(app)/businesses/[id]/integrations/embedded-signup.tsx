"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import type { EmbeddedSignupConfigDto, WhatsAppSignupSessionDto } from "@spa/shared";
import { Button } from "@/components/ui/button";
import { FormAlert, SubmitButton } from "@/components/ui/form-field";
import { StateBadge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { formatDateTime } from "@/lib/format";
import {
  completeEmbeddedSignupAction,
  createSignupLinkAction,
  revokeSignupLinkAction,
  type FormState,
  type SignupLinkState,
} from "../../actions";

/**
 * Embedded Signup de WhatsApp en el panel (docs/PANEL-OPERADOR.md §7.4).
 *
 * Hay dos caminos al mismo resultado y el orden en que se muestran no es
 * cosmético: el enlace va primero porque es el que funciona siempre. El signup
 * lo tiene que completar el dueño de la WABA con **su** Facebook y **su**
 * tarjeta (D2), así que el operador solo puede hacerlo él mismo cuando está
 * sentado con el cliente. Para todo lo demás —que es casi todo— le manda el
 * enlace por WhatsApp y el cliente lo abre en su teléfono.
 */

declare global {
  interface Window {
    FB?: {
      init(options: Record<string, unknown>): void;
      login(callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>): void;
    };
    fbAsyncInit?: () => void;
  }
}

interface FacebookLoginResponse {
  authResponse?: { code?: string } | null;
}

/** Lo que manda el popup por `postMessage`; el `code` llega por otro canal. */
interface SessionInfo {
  waba_id?: string;
  phone_number_id?: string;
  business_id?: string;
}

const SDK_URL = "https://connect.facebook.net/es_LA/sdk.js";
const FB_ORIGINS = ["https://www.facebook.com", "https://web.facebook.com"];

export function EmbeddedSignupPanel({
  businessId,
  config,
  sessions,
}: {
  businessId: string;
  config: EmbeddedSignupConfigDto;
  sessions: WhatsAppSignupSessionDto[];
}) {
  if (!config.enabled) {
    return (
      <Callout tone="info" title="Conexión automática no disponible todavía">
        El Embedded Signup necesita la app de Meta aprobada con acceso avanzado (§7.1), y eso exige
        la verificación de negocio. Mientras tanto el número se conecta a mano aquí abajo: es el
        puente de §7.3 y el resultado en la base es el mismo.
      </Callout>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div>
        <p className="text-sm font-medium">Que el cliente conecte su propio número</p>
        <p className="text-sm text-[var(--color-fg-muted)]">
          El cliente entra con su Facebook y autoriza su cuenta de WhatsApp Business. La WABA y la
          tarjeta quedan a su nombre; nosotros solo quedamos autorizados para enviar y recibir. El
          backend suscribe la app a sus webhooks y registra el número — los dos pasos que a mano se
          olvidan.
        </p>
      </div>

      <SignupLinkForm businessId={businessId} />
      <SessionList businessId={businessId} sessions={sessions} />

      <div className="border-t border-[var(--color-border)] pt-4">
        <FacebookButton businessId={businessId} config={config} />
      </div>
    </div>
  );
}

// ── Enlace de auto-conexión ────────────────────────────────────────────────

function SignupLinkForm({ businessId }: { businessId: string }) {
  const [state, formAction] = useActionState<SignupLinkState, FormData>(
    createSignupLinkAction.bind(null, businessId),
    { ok: false },
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div>
        <SubmitButton label="Generar enlace para el cliente" pendingLabel="Generando…" />
      </div>
      <FormAlert state={state} />
      {state.url ? <CopyableLink url={state.url} /> : null}
    </form>
  );
}

/**
 * La URL se muestra una sola vez (de la base solo se puede recuperar el hash),
 * así que el foco por defecto es copiarla — y queda a la vista en un campo de
 * solo lectura por si el portapapeles no está disponible.
 */
function CopyableLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-[var(--color-success-soft)] p-3">
      <p className="text-xs text-[var(--color-success)]">
        Mándaselo al cliente por WhatsApp. Vence según la configuración del despliegue y sirve una
        sola vez; generar otro cancela este.
      </p>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full rounded-[var(--radius)] border border-[var(--color-success-soft)] bg-[var(--color-background)] px-2 py-1 font-mono text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Sin permiso de portapapeles: el campo ya tiene el texto; se
              // selecciona para que copiarlo a mano sea un Ctrl+C.
              inputRef.current?.select();
            }
          }}
        >
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}

function SessionList({
  businessId,
  sessions,
}: {
  businessId: string;
  sessions: WhatsAppSignupSessionDto[];
}) {
  if (sessions.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-2">
      {sessions.map((session) => (
        <SessionRow key={session.id} businessId={businessId} session={session} />
      ))}
    </ul>
  );
}

function SessionRow({
  businessId,
  session,
}: {
  businessId: string;
  session: WhatsAppSignupSessionDto;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    revokeSignupLinkAction.bind(null, businessId, session.id),
    { ok: false },
  );

  return (
    <li className="flex flex-col gap-1 border-t border-[var(--color-border)] pt-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StateBadge value={session.status} />
          <span className="text-[var(--color-fg-muted)]">
            {session.status === "COMPLETED" && session.completedAt
              ? `Usado el ${formatDateTime(session.completedAt)}`
              : session.status === "PENDING"
                ? `Vence el ${formatDateTime(session.expiresAt)}`
                : `Creado el ${formatDateTime(session.createdAt)}`}
          </span>
        </div>
        {session.status === "PENDING" ? (
          <form action={formAction}>
            <SubmitButton variant="outline" size="sm" label="Cancelar" pendingLabel="…" />
          </form>
        ) : null}
      </div>
      {/* El último error de Meta, para no tener que pedirle una captura al cliente. */}
      {session.lastError ? (
        <p className="text-[var(--color-danger)]">Último intento: {session.lastError}</p>
      ) : null}
      {state.error ? <p className="text-[var(--color-danger)]">{state.error}</p> : null}
    </li>
  );
}

// ── El botón de Facebook, para cuando el operador está con el cliente ───────

function FacebookButton({
  businessId,
  config,
}: {
  businessId: string;
  config: EmbeddedSignupConfigDto;
}) {
  const [state, setState] = useState<FormState>({ ok: false });
  const [busy, setBusy] = useState(false);

  // Las dos mitades del resultado del popup llegan por canales distintos:
  // `postMessage` trae los identificadores, el callback de `FB.login` trae el
  // code. Se guardan en refs (no en estado) porque no se pintan: solo hay que
  // esperar a tener las dos, sin asumir en qué orden llegaron.
  const sessionInfo = useRef<SessionInfo | null>(null);
  const authCode = useRef<string | null>(null);
  const sending = useRef(false);

  /** Envía cuando —y solo cuando— están las dos mitades. */
  const trySubmit = useCallback(async () => {
    const info = sessionInfo.current;
    const code = authCode.current;
    if (sending.current || !info || !code) {
      return;
    }
    if (!info.waba_id || !info.phone_number_id) {
      setState({ ok: false, error: "Facebook no devolvió el número seleccionado." });
      return;
    }

    sending.current = true;
    setBusy(true);
    const result = await completeEmbeddedSignupAction(businessId, {
      code,
      wabaId: String(info.waba_id),
      phoneNumberId: String(info.phone_number_id),
      businessPortfolioId: info.business_id ? String(info.business_id) : "",
    });
    // El code es de un solo uso: reintentar exige volver a pasar por el popup.
    sessionInfo.current = null;
    authCode.current = null;
    sending.current = false;
    setBusy(false);
    setState(result);
  }, [businessId]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Cualquier página puede mandar un `postMessage`, y esto termina creando
      // una cuenta: solo se acepta desde el origen de Facebook.
      if (!FB_ORIGINS.includes(event.origin)) {
        return;
      }
      let payload: {
        type?: string;
        event?: string;
        data?: SessionInfo & { error_message?: string };
      };
      try {
        payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (payload?.type !== "WA_EMBEDDED_SIGNUP") {
        return;
      }
      if (payload.event === "FINISH" || payload.event === "FINISH_ONLY_WABA") {
        sessionInfo.current = payload.data ?? {};
        void trySubmit();
        return;
      }
      if (payload.event === "CANCEL") {
        setState({ ok: false, error: "Se cerró la ventana de Facebook antes de terminar." });
      } else if (payload.event === "ERROR") {
        setState({ ok: false, error: payload.data?.error_message ?? "Facebook cortó el proceso." });
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [trySubmit]);

  async function launch() {
    setState({ ok: false });
    const FB = await loadFacebookSdk(config).catch(() => null);
    if (!FB) {
      setState({ ok: false, error: "No se pudo cargar el conector de Facebook." });
      return;
    }

    FB.login(
      (response) => {
        const code = response?.authResponse?.code;
        if (!code) {
          // Si además hubo un CANCEL, ese mensaje ya está puesto; este es el
          // respaldo para cuando el popup se cierra en seco.
          if (!sessionInfo.current) {
            setState({ ok: false, error: "El cliente no autorizó el acceso." });
          }
          return;
        }
        authCode.current = code;
        void trySubmit();
      },
      {
        config_id: config.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--color-fg-muted)]">
        ¿Estás con el cliente? Abre el flujo aquí mismo. Tiene que iniciar sesión{" "}
        <strong>él</strong>: la cuenta de WhatsApp Business queda a su nombre.
      </p>
      <div>
        <Button type="button" onClick={() => void launch()} disabled={busy}>
          {busy ? "Conectando…" : "Continuar con Facebook"}
        </Button>
      </div>
      <FormAlert state={state} />
    </div>
  );
}

/** Carga el SDK una sola vez; el appId lo sirve el backend, no un `NEXT_PUBLIC_*`. */
function loadFacebookSdk(config: EmbeddedSignupConfigDto): Promise<NonNullable<Window["FB"]>> {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve(window.FB);
      return;
    }
    window.fbAsyncInit = () => {
      window.FB!.init({
        appId: config.appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: config.graphVersion,
      });
      resolve(window.FB!);
    };
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new Error("sdk"));
    document.head.appendChild(script);
  });
}
