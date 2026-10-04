import type { FastifyInstance } from "fastify";

/**
 * CSP propia de `/conectar` (§7.4). La global que pone helmet es `script-src
 * 'self'`, que bloquearía el SDK de Facebook — y el Embedded Signup **es** ese
 * SDK: no hay forma de hacerlo con un `fetch` nuestro, porque el login pasa por
 * el dominio de Meta.
 *
 * Se amplía solo en esta ruta y solo con los orígenes de Facebook, en vez de
 * aflojar la política global: las páginas de reserva y de gift cards —donde hay
 * datos de clientas y montos— siguen sin poder cargar scripts de terceros.
 */
const SIGNUP_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' https: data:",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "img-src 'self' data: https://*.facebook.com https://*.fbcdn.net",
  "object-src 'none'",
  // El SDK se sirve desde connect.facebook.net y él mismo inyecta el iframe de
  // comunicación con www.facebook.com; las llamadas van a graph.facebook.com.
  "script-src 'self' https://connect.facebook.net",
  "script-src-attr 'none'",
  // Comodín de *.facebook.com: según la cuenta/país el SDK habla con www., web.,
  // business. o m.facebook.com, y un bloqueo acá rompe FB.login en silencio.
  "connect-src 'self' https://*.facebook.com",
  "frame-src https://*.facebook.com",
  "style-src 'self' https: 'unsafe-inline'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Páginas del frontend vanilla (sección 3/40), servidas como estáticos por el
 * propio backend — un solo contenedor desplegable, sin CORS (ARCHITECTURE.md).
 * Los assets (`/css`, `/js`) los sirve el plugin `@fastify/static` registrado
 * en `app.ts`; aquí solo se exponen las URLs "limpias" de cada página.
 */
export async function webRoutes(app: FastifyInstance): Promise<void> {
  app.get("/reservar", (_request, reply) => reply.sendFile("reservar/index.html"));
  app.get("/gracias", (_request, reply) => reply.sendFile("gracias/index.html"));
  app.get("/regalar", (_request, reply) => reply.sendFile("regalar/index.html"));
  app.get("/validar", (_request, reply) => reply.sendFile("validar/index.html"));

  /**
   * Auto-conexión de WhatsApp (docs/PANEL-OPERADOR.md §7.4): la página que abre
   * el dueño del spa con el enlace que le mandó el operador. El token no se
   * mira acá —se sirve la misma página para cualquiera— y es el JS el que se lo
   * pregunta a `/api/whatsapp/signup/:token`: así un enlace vencido muestra un
   * mensaje en vez de un 404 del servidor.
   */
  app.get("/conectar/:token", (_request, reply) => {
    reply.header("content-security-policy", SIGNUP_CSP);
    // El `same-origin` de helmet corta el `window.opener` del popup de Meta: el
    // SDK nunca recibe la respuesta (FB.login vuelve con status "unknown" y sin
    // code) y tampoco llega el postMessage WA_EMBEDDED_SIGNUP.
    reply.header("cross-origin-opener-policy", "same-origin-allow-popups");
    return reply.sendFile("conectar/index.html");
  });

  // Páginas legales para la revisión de la app de Meta (Facebook Login / WhatsApp
  // Embedded Signup). Deben cargar sin login ni redirección — ver docs/files/README.md.
  // URLs registradas en el App Dashboard:
  //   Política de privacidad          → /legal/privacidad
  //   Condiciones del servicio        → /legal/terminos
  //   Instrucciones de eliminación    → /legal/eliminacion-de-datos
  app.get("/legal/privacidad", (_request, reply) => reply.sendFile("legal/privacidad/index.html"));
  app.get("/legal/terminos", (_request, reply) => reply.sendFile("legal/terminos/index.html"));
  app.get("/legal/eliminacion-de-datos", (_request, reply) =>
    reply.sendFile("legal/eliminacion-de-datos/index.html"),
  );
}
