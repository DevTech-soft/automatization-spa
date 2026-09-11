import type { FastifyInstance } from "fastify";
import { embeddedSignupCallbackSchema } from "@spa/shared";
import { z } from "zod";
import {
  completeSignupFromInvite,
  getSignupInvite,
} from "../services/whatsapp-signup.service.js";

/**
 * Cara pública del Embedded Signup (docs/PANEL-OPERADOR.md §7.4).
 *
 * Estas dos rutas son las únicas de todo el flujo **sin sesión**: las abre el
 * dueño del spa desde el enlace que le mandó el operador, y no tiene —ni va a
 * tener— usuario en el panel. La autorización es el token del enlace: 32 bytes
 * aleatorios, de un solo uso y con vencimiento.
 *
 * El token viaja en el path y no en el body porque tiene que poder pegarse en
 * un chat de WhatsApp. Eso implica que queda en los logs de acceso del proxy,
 * así que su poder es deliberadamente mínimo: conectar **un** número a **un**
 * negocio, y nada más — no lee citas, no lee clientas, no lista negocios.
 *
 * El límite por minuto es más bajo que el global: adivinar un token de 256 bits
 * no es una amenaza real, pero tampoco hay razón para que alguien golpee este
 * endpoint más de un puñado de veces.
 */
const tokenParamSchema = z.object({
  // base64url de 32 bytes: 43 caracteres. Se valida la forma antes de tocar la
  // base para que un path cualquiera no se convierta en una consulta.
  token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, "Enlace inválido."),
});

const publicSignupRateLimit = {
  config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
};

export async function whatsappSignupRoutes(app: FastifyInstance): Promise<void> {
  /** Portada del enlace: nombre del negocio, si sirve, y la config del popup. */
  app.get("/api/whatsapp/signup/:token", publicSignupRateLimit, async (request) => {
    const { token } = tokenParamSchema.parse(request.params);
    return { data: await getSignupInvite(token) };
  });

  /** El `code` del popup de Facebook → número conectado. */
  app.post("/api/whatsapp/signup/:token", publicSignupRateLimit, async (request) => {
    const { token } = tokenParamSchema.parse(request.params);
    const body = embeddedSignupCallbackSchema.parse(request.body);
    return { data: await completeSignupFromInvite(token, body) };
  });
}
