import { randomInt } from "node:crypto";
import { env } from "../../config/env.js";
import { MetaGraphError } from "../../errors/index.js";
import { logger } from "../../utils/logger.js";

/**
 * Llamadas a la Graph API que componen el **Embedded Signup** de WhatsApp
 * (docs/PANEL-OPERADOR.md §7.4).
 *
 * El flujo tiene dos mitades. La del browser —el popup de "continuar con
 * Facebook"— la maneja el SDK de Facebook y termina entregando tres datos:
 * `code`, `waba_id` y `phone_number_id`. La de acá, servidor a servidor, es la
 * que convierte eso en un número que ya puede mandar mensajes:
 *
 * 1. `exchangeCodeForBusinessToken` — cambia el `code` por un token de la WABA
 *    **del cliente**. Es un token de system user de la integración: no expira,
 *    y es lo único que hay que guardar (cifrado, §9).
 * 2. `subscribeAppToWaba` — suscribe la app del operador a los webhooks de esa
 *    WABA. Sin esto los mensajes entrantes nunca llegan: es exactamente el
 *    gotcha que se documentó a mano en `docs/WHATSAPP.md`, acá automatizado.
 * 3. `registerPhoneNumber` — habilita el número en Cloud API con un PIN de
 *    verificación en dos pasos.
 * 4. `fetchPhoneNumberDetails` — el nombre visible, la calidad y el tier, para
 *    mostrarlos en el panel sin que el operador tenga que entrar a Meta.
 *
 * Este módulo no toca la base de datos ni sabe qué es un negocio; orquestar y
 * persistir es trabajo de `whatsapp-signup.service.ts`.
 */

export interface EmbeddedSignupPublicConfig {
  appId: string;
  configId: string;
  /** La misma versión que usa el SDK de Facebook en el browser. */
  graphVersion: string;
}

export interface PhoneNumberDetails {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimit: string | null;
  /** `NOT_VERIFIED` | `VERIFIED` — Meta lo llama `code_verification_status`. */
  codeVerificationStatus: string | null;
  /** Si el número ya está habilitado en Cloud API (`CLOUD_API`). */
  platformType: string | null;
}

/**
 * Las tres piezas que tiene que haber configurado el operador. Se leen juntas y
 * se devuelven juntas —o no se devuelve ninguna— porque con dos de las tres el
 * flujo no arranca: sirve para que el resto del módulo trabaje con `string` y
 * no con `string | undefined`.
 */
interface SignupCredentials {
  appId: string;
  configId: string;
  appSecret: string;
}

function readSignupCredentials(): SignupCredentials | null {
  const appId = env.META_APP_ID;
  const configId = env.META_EMBEDDED_SIGNUP_CONFIG_ID;
  const appSecret = env.WHATSAPP_APP_SECRET;
  if (!appId || !configId || !appSecret) {
    return null;
  }
  return { appId, configId, appSecret };
}

/**
 * `true` si el operador ya pasó el App Review y configuró el flujo. Con esto en
 * `false` el panel oculta el botón de Facebook y deja solo el alta manual
 * (§7.3), en vez de ofrecer un botón que va a fallar.
 */
export function isEmbeddedSignupConfigured(): boolean {
  return readSignupCredentials() !== null;
}

/** Lo que el browser necesita para abrir el popup. Nada de esto es secreto. */
export function getEmbeddedSignupPublicConfig(): EmbeddedSignupPublicConfig | null {
  const credentials = readSignupCredentials();
  if (!credentials) {
    return null;
  }
  return {
    appId: credentials.appId,
    configId: credentials.configId,
    graphVersion: env.META_GRAPH_VERSION,
  };
}

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${path.replace(/^\//, "")}`;
}

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

/**
 * Wrapper único de la Graph API para este flujo. Traduce cualquier no-2xx a
 * `MetaGraphError` con el mensaje que Meta le mostraría a un humano
 * (`error_user_msg` si existe, que suele ser más claro que `message`).
 *
 * El token nunca entra al log —ni en la URL ni en el cuerpo—: solo el path y el
 * error de Meta.
 */
async function graphFetch<T>(
  path: string,
  init: RequestInit & { accessToken?: string },
  operation: string,
): Promise<T> {
  const { accessToken, ...rest } = init;

  let response: Response;
  try {
    response = await fetch(graphUrl(path), {
      ...rest,
      headers: {
        accept: "application/json",
        ...(rest.headers ?? {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  } catch (error) {
    logger.error({ operation, error }, "meta_graph_unreachable");
    throw new MetaGraphError(
      "No se pudo contactar a la Graph API de Meta. Reintenta en un momento.",
    );
  }

  const body = (await response.json().catch(() => ({}))) as GraphErrorBody & Record<string, unknown>;

  if (!response.ok) {
    const meta = body.error ?? {};
    logger.error(
      {
        operation,
        status: response.status,
        code: meta.code,
        subcode: meta.error_subcode,
        fbtrace: meta.fbtrace_id,
        message: meta.message,
      },
      "meta_graph_error",
    );
    throw new MetaGraphError(
      meta.error_user_msg || meta.message || `Meta respondió ${response.status} en ${operation}.`,
      {
        operation,
        status: response.status,
        code: meta.code,
        subcode: meta.error_subcode,
        fbtraceId: meta.fbtrace_id,
      },
    );
  }

  return body as T;
}

/**
 * Paso 1: `code` → token de la WABA del cliente.
 *
 * El `client_secret` es el App Secret del operador (`WHATSAPP_APP_SECRET`); el
 * `code` es de un solo uso y vive pocos minutos, así que este intercambio tiene
 * que ocurrir apenas el browser lo entrega.
 *
 * Meta devuelve un *business integration system user access token*: sin
 * `expires_in`, no hace falta refrescarlo. Se revoca si el cliente le quita el
 * acceso a la app desde su Business Manager.
 */
export async function exchangeCodeForBusinessToken(code: string): Promise<string> {
  const credentials = readSignupCredentials();
  if (!credentials) {
    throw new MetaGraphError(
      "El Embedded Signup no está configurado en este despliegue (faltan META_APP_ID, " +
        "META_EMBEDDED_SIGNUP_CONFIG_ID o WHATSAPP_APP_SECRET).",
    );
  }

  const params = new URLSearchParams({
    client_id: credentials.appId,
    client_secret: credentials.appSecret,
    code,
  });

  const body = await graphFetch<{ access_token?: string }>(
    `oauth/access_token?${params.toString()}`,
    { method: "GET" },
    "exchange_code",
  );

  if (!body.access_token) {
    throw new MetaGraphError("Meta no devolvió un token para este código de autorización.");
  }
  return body.access_token;
}

/**
 * Paso 2: suscribe la app del operador a los webhooks de la WABA del cliente.
 *
 * Es el paso que más se olvida haciendo esto a mano y el que produce el "todo
 * se ve bien pero no llega ningún mensaje" documentado en `docs/WHATSAPP.md`.
 * Acá es obligatorio y automático.
 */
export async function subscribeAppToWaba(wabaId: string, accessToken: string): Promise<void> {
  const body = await graphFetch<{ success?: boolean }>(
    `${wabaId}/subscribed_apps`,
    { method: "POST", accessToken },
    "subscribe_app",
  );

  if (body.success === false) {
    throw new MetaGraphError("Meta rechazó la suscripción de la app a la WABA del cliente.");
  }
}

/** PIN de dos pasos de 6 dígitos, generado con entropía criptográfica. */
export function generateRegistrationPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Paso 3: habilita el número en Cloud API.
 *
 * El PIN es la verificación en dos pasos del número: se genera acá, se guarda
 * cifrado junto a la cuenta, y hace falta para volver a registrar el número si
 * alguna vez Meta lo desactiva. Si el cliente ya tenía dos pasos activado con
 * *otro* PIN, Meta responde 133005 y no hay forma de adivinarlo — ese caso se
 * reporta tal cual para que el operador se lo pida al cliente.
 *
 * Un número ya registrado (133006) **no** es un error del flujo: se trata como
 * éxito idempotente, porque reintentar el enlace no debe romperse por eso.
 */
export async function registerPhoneNumber(
  phoneNumberId: string,
  pin: string,
  accessToken: string,
): Promise<{ registered: boolean; detail: string }> {
  try {
    await graphFetch(
      `${phoneNumberId}/register`,
      {
        method: "POST",
        accessToken,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", pin }),
      },
      "register_phone_number",
    );
    return { registered: true, detail: "Número registrado en Cloud API." };
  } catch (error) {
    const details =
      error instanceof MetaGraphError ? (error.details as { code?: number } | undefined) : undefined;
    if (details?.code === 133006) {
      logger.info({ phoneNumberId }, "whatsapp_number_already_registered");
      return { registered: true, detail: "El número ya estaba registrado en Cloud API." };
    }
    throw error;
  }
}

/** Paso 4: los datos del número que el panel muestra (nombre, calidad, tier). */
export async function fetchPhoneNumberDetails(
  phoneNumberId: string,
  accessToken: string,
): Promise<PhoneNumberDetails> {
  const fields = [
    "display_phone_number",
    "verified_name",
    "quality_rating",
    "messaging_limit_tier",
    "code_verification_status",
    "platform_type",
  ].join(",");

  const body = await graphFetch<Record<string, unknown>>(
    `${phoneNumberId}?fields=${fields}`,
    { method: "GET", accessToken },
    "fetch_phone_number",
  );

  return {
    displayPhoneNumber: (body.display_phone_number as string) ?? null,
    verifiedName: (body.verified_name as string) ?? null,
    qualityRating: (body.quality_rating as string) ?? null,
    messagingLimit: (body.messaging_limit_tier as string) ?? null,
    codeVerificationStatus: (body.code_verification_status as string) ?? null,
    platformType: (body.platform_type as string) ?? null,
  };
}

/**
 * Confirma que la app quedó suscrita a la WABA. Se consulta **después** de
 * suscribir en vez de confiar en el `success: true`, porque es la señal que el
 * panel muestra y la que explica por qué no llegan mensajes.
 *
 * Nunca lanza: no saber el estado de la suscripción no debe tumbar un signup
 * que por lo demás salió bien.
 */
export async function fetchSubscriptionStatus(
  wabaId: string,
  accessToken: string,
): Promise<string> {
  try {
    const body = await graphFetch<{ data?: { whatsapp_business_api_data?: { id?: string } }[] }>(
      `${wabaId}/subscribed_apps`,
      { method: "GET", accessToken },
      "fetch_subscribed_apps",
    );
    const apps = body.data ?? [];
    const subscribed = apps.some((entry) => entry.whatsapp_business_api_data?.id === env.META_APP_ID);
    return subscribed ? "SUBSCRIBED" : "NOT_SUBSCRIBED";
  } catch (error) {
    logger.warn({ wabaId, error }, "whatsapp_subscription_status_unknown");
    return "UNKNOWN";
  }
}
