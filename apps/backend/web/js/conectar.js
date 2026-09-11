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
const FB_ORIGINS = ["https://www.facebook.com", "https://web.facebook.com"];

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
    script.onerror = () => reject(new Error("No se pudo cargar el conector de Facebook."));
    document.head.appendChild(script);
  });
}

/**
 * El popup avisa por `postMessage` que el usuario eligio su WABA y su numero.
 * Se acepta solo si viene de facebook.com: cualquier pagina puede mandar un
 * mensaje, y esto termina creando una cuenta.
 */
window.addEventListener("message", (event) => {
  if (!FB_ORIGINS.includes(event.origin)) {
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

  if (payload.event === "FINISH" || payload.event === "FINISH_ONLY_WABA") {
    sessionInfo = payload.data || {};
    trySubmit();
    return;
  }
  // CANCEL y ERROR: el usuario cerro el popup o Meta corto el flujo. Se muestra
  // en la misma pantalla para que pueda reintentar sin recargar.
  if (payload.event === "CANCEL") {
    showError(
      readyError,
      "Cerraste la ventana de Facebook antes de terminar. Puedes intentarlo de nuevo.",
    );
  } else if (payload.event === "ERROR") {
    showError(
      readyError,
      (payload.data && payload.data.error_message) ||
        "Facebook cortó el proceso. Inténtalo de nuevo.",
    );
  }
});

/**
 * Abre el popup. `response_type: code` + `override_default_response_type` es lo
 * que hace que Facebook devuelva un codigo canjeable en el servidor en vez de
 * un token de usuario en el browser.
 */
function launchSignup(config) {
  window.FB.login(
    (response) => {
      if (response && response.authResponse && response.authResponse.code) {
        authCode = response.authResponse.code;
        trySubmit();
        return;
      }
      // Sin code: no se autorizo. Si ademas hubo un CANCEL el mensaje ya esta
      // puesto; este es el respaldo cuando el popup se cierra en seco.
      if (!sessionInfo) {
        showError(
          readyError,
          "No autorizaste el acceso, así que no se conectó nada. Puedes intentarlo de nuevo.",
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
      "Facebook no devolvió el número seleccionado. Inténtalo de nuevo y asegúrate de elegir un número.",
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

  connectButton.addEventListener("click", async () => {
    showError(readyError, "");
    connectButton.disabled = true;
    try {
      await loadFacebookSdk(invite.config);
      launchSignup(invite.config);
    } catch (error) {
      showError(readyError, error.message);
    } finally {
      connectButton.disabled = false;
    }
  });

  retryButton.addEventListener("click", () => {
    showError(readyError, "");
    show("ready");
  });
}

start();
