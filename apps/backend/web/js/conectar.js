// Auto-conexion de WhatsApp (docs/PANEL-OPERADOR.md 7.4): la mitad de browser
// del Embedded Signup. La abre el dueno del spa con el enlace que le mando el
// operador; el token va en el path.
//
// Lo unico que hace esta pagina es orquestar el popup de Facebook y mandarle al
// backend los tres datos que devuelve. No toca la Graph API ni ve ningun token:
// el canje del `code` es server-to-server por diseno, porque el App Secret no
// puede bajar al browser.
//
// El popup entrega el resultado por DOS canales distintos y hacen falta los dos:
//   - `postMessage` (evento WA_EMBEDDED_SIGNUP) trae `waba_id` y
//     `phone_number_id`, pero no el code.
//   - el callback de `FB.login` trae el `code`, pero no los identificadores.
// Por eso se guardan a medida que llegan y se envia cuando estan las dos
// mitades, sin asumir en que orden llegaron.

import { apiRequest } from "./api.js";

const SDK_URL = "https://connect.facebook.net/es_LA/sdk.js";

/**
 * El popup puede contestar desde www., web., business. o m.facebook.com segun
 * la cuenta y el pais. Se valida protocolo + dominio exacto en vez de una lista
 * fija para no descartar en silencio el FINISH de un subdominio no previsto.
 */
function isFacebookOrigin(origin) {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "https:" &&
      (url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com"))
    );
  } catch {
    return false;
  }
}

const panels = {
  loading: document.getElementById("loadingPanel"),
  unavailable: document.getElementById("unavailablePanel"),
  ready: document.getElementById("readyPanel"),
  working: document.getElementById("workingPanel"),
  done: document.getElementById("donePanel"),
  failed: document.getElementById("failedPanel"),
};

const connectButton = document.getElementById("connectButton");
const retryButton = document.getElementById("retryButton");
const readyError = document.getElementById("readyError");
const failedError = document.getElementById("failedError");
const unavailableReason = document.getElementById("unavailableReason");

/** El token del enlace: `/conectar/<token>`. */
const token = decodeURIComponent(window.location.pathname.split("/").filter(Boolean)[1] || "");

/** Las dos mitades del resultado del popup, que llegan por canales separados. */
let sessionInfo = null;
let authCode = null;
let sending = false;
/** Se puso un mensaje mas especifico (CANCEL/ERROR) que el generico de FB.login. */
let flowMessageShown = false;

function show(name) {
  Object.entries(panels).forEach(([key, panel]) => {
    panel.hidden = key !== name;
  });
}

function showError(container, message) {
  container.innerHTML = "";
  if (!message) {
    return;
  }
  const alert = document.createElement("div");
  alert.className = "alert alert--error";
  alert.setAttribute("role", "alert");
  alert.textContent = message;
  container.appendChild(alert);
}

function renderSteps(steps) {
  const container = document.getElementById("doneSteps");
  container.innerHTML = "";
  steps.forEach((step) => {
    const row = document.createElement("div");
    row.className = "receipt__row";
    const label = document.createElement("span");
    label.className = "receipt__label";
    label.textContent = step.label;
    const detail = document.createElement("span");
    detail.textContent = step.detail;
    row.append(label, detail);
    container.appendChild(row);
  });
}

function unavailable(message) {
  unavailableReason.textContent = message;
  show("unavailable");
}

// — SDK de Facebook —

/**
 * Carga el SDK una sola vez. `FB.init` necesita el appId que sirve el backend
 * (cambia por despliegue), asi que no puede estar escrito en el HTML.
 */
function loadFacebookSdk(config) {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve(window.FB);
      return;
    }
    window.fbAsyncInit = () => {
      window.FB.init({
        appId: config.appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: config.graphVersion,
      });
      resolve(window.FB);
    };
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () =>
      reject(
        new Error(
          "No se pudo cargar el conector de Meta. Revisa tu conexión o desactiva el bloqueador de anuncios y recarga la página.",
        ),
      );
    document.head.appendChild(script);
  });
}

/**
 * El popup avisa por `postMessage` que el usuario eligio su WABA y su numero.
 * Se acepta solo si viene de facebook.com: cualquier pagina puede mandar un
 * mensaje, y esto termina creando una cuenta.
 */
window.addEventListener("message", (event) => {
  if (!isFacebookOrigin(event.origin)) {
    return;
  }
  let payload;
  try {
    payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
  } catch {
    return;
  }
  if (!payload || payload.type !== "WA_EMBEDDED_SIGNUP") {
    return;
  }
  // Se deja en consola para poder diagnosticar con el cliente en llamada: no
  // trae tokens, solo el paso en el que iba y los ids.
  console.info("[conectar] WA_EMBEDDED_SIGNUP", payload.event, payload.data);

  if (payload.event === "FINISH" || payload.event === "FINISH_ONLY_WABA") {
    sessionInfo = payload.data || {};
    trySubmit();
    return;
  }
  // CANCEL y ERROR: el usuario cerro el popup o Meta corto el flujo. Se muestra
  // en la misma pantalla para que pueda reintentar sin recargar. En la v3 los
  // errores de Meta llegan como CANCEL con `error_message`, no como ERROR.
  const data = payload.data || {};
  if (data.error_message) {
    flowMessageShown = true;
    showError(
      readyError,
      `Meta no dejó completar la conexión ("${data.error_message}"). ` +
        "Si tu usuario no tiene permisos de administración en el portafolio comercial de tu " +
        "negocio, pídele a quien los tenga que abra este enlace.",
    );
  } else if (payload.event === "CANCEL") {
    flowMessageShown = true;
    const step = data.current_step ? ` (ibas en el paso "${data.current_step}")` : "";
    showError(
      readyError,
      `Cerraste la ventana de Meta antes de terminar${step}, así que no se conectó nada. Puedes intentarlo de nuevo.`,
    );
  } else if (payload.event === "ERROR") {
    flowMessageShown = true;
    showError(readyError, "Meta no pudo completar la conexión. Inténtalo de nuevo.");
  }
});

/**
 * Abre el popup. `response_type: code` + `override_default_response_type` es lo
 * que hace que Facebook devuelva un codigo canjeable en el servidor en vez de
 * un token de usuario en el browser.
 */
function launchSignup(config) {
  flowMessageShown = false;
  window.FB.login(
    (response) => {
      if (response && response.authResponse && response.authResponse.code) {
        authCode = response.authResponse.code;
        trySubmit();
        return;
      }
      // Sin code. Se loguea la respuesta completa (sin code no hay nada
      // sensible) porque `status` distingue "el usuario cancelo" de "Meta no
      // dejo usar la app" (app en modo desarrollo, dominio no permitido...).
      console.warn("[conectar] FB.login sin code", response);
      // Si hubo un CANCEL/ERROR del popup su mensaje es mas preciso; este es el
      // respaldo cuando el popup se cierra en seco.
      if (!sessionInfo && !flowMessageShown) {
        const status = response && response.status ? ` (estado: ${response.status})` : "";
        showError(
          readyError,
          `La autorización de Meta se canceló o no se pudo completar${status}, así que no se conectó nada. ` +
            "Puedes intentarlo de nuevo; si se repite, avísale a quien te envió el enlace.",
        );
      }
    },
    {
      config_id: config.configId,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
    },
  );
}

// — Envio al backend —

async function trySubmit() {
  if (sending || !authCode || !sessionInfo) {
    return;
  }
  if (!sessionInfo.waba_id || !sessionInfo.phone_number_id) {
    showError(
      readyError,
      "Meta no devolvió el número seleccionado. Inténtalo de nuevo y asegúrate de elegir un número.",
    );
    return;
  }

  sending = true;
  show("working");
  try {
    const result = await apiRequest(`/api/whatsapp/signup/${encodeURIComponent(token)}`, {
      method: "POST",
      body: {
        code: authCode,
        wabaId: String(sessionInfo.waba_id),
        phoneNumberId: String(sessionInfo.phone_number_id),
        businessPortfolioId: sessionInfo.business_id ? String(sessionInfo.business_id) : "",
      },
    });
    const phone = result.account && result.account.displayPhoneNumber;
    const donePhone = document.getElementById("donePhone");
    donePhone.textContent = phone ? `Número: ${phone}` : "";
    donePhone.hidden = !phone;
    renderSteps(result.steps || []);
    show("done");
  } catch (error) {
    showError(failedError, error.message);
    show("failed");
  } finally {
    // El `code` es de un solo uso: si el envio fallo hay que volver a pasar por
    // el popup, no reintentar con el mismo.
    sending = false;
    authCode = null;
    sessionInfo = null;
  }
}

// — Arranque —

async function start() {
  if (!token) {
    unavailable("El enlace está incompleto.");
    return;
  }

  let invite;
  try {
    invite = await apiRequest(`/api/whatsapp/signup/${encodeURIComponent(token)}`);
  } catch (error) {
    unavailable(error.message);
    return;
  }

  if (invite.unavailableReason) {
    unavailable(invite.unavailableReason);
    return;
  }
  if (!invite.config || !invite.config.enabled) {
    unavailable(
      "La conexión automática no está habilitada todavía. Quien te envió el enlace puede conectarte el número a mano.",
    );
    return;
  }

  document.getElementById("readyBusiness").textContent = invite.businessName;
  show("ready");

  // El SDK se precarga ya, no en el click: `FB.login` tiene que correr dentro
  // del gesto del usuario o el navegador puede bloquear el popup o perder su
  // respuesta. El boton queda deshabilitado hasta que el SDK este listo.
  connectButton.disabled = true;
  const sdkReady = loadFacebookSdk(invite.config).then(
    () => {
      connectButton.disabled = false;
    },
    (error) => {
      showError(readyError, error.message);
    },
  );

  connectButton.addEventListener("click", () => {
    showError(readyError, "");
    if (!window.FB) {
      sdkReady.then(() => window.FB && launchSignup(invite.config));
      return;
    }
    launchSignup(invite.config);
  });

  retryButton.addEventListener("click", () => {
    showError(readyError, "");
    show("ready");
  });
}

start();
