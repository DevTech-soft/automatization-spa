import type { FastifyInstance } from "fastify";
import {
  connectWhatsAppSchema,
  embeddedSignupCallbackSchema,
  updateWhatsAppSchema,
  upsertPaymentCredentialsSchema,
} from "@spa/shared";
import { z } from "zod";
import {
  connectWhatsAppAccount,
  disconnectWhatsAppAccount,
  listWhatsAppAccounts,
  updateWhatsAppAccount,
  verifyWhatsAppAccount,
} from "../services/admin-whatsapp.service.js";
import {
  completeEmbeddedSignup,
  createSignupLink,
  getEmbeddedSignupConfig,
  listSignupLinks,
  revokeSignupLink,
} from "../services/whatsapp-signup.service.js";
import {
  deletePaymentCredentials,
  getPaymentCredentials,
  upsertPaymentCredentials,
} from "../services/admin-payment-credentials.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const accountParamsSchema = z.object({ id: z.string().uuid(), accountId: z.string().uuid() });
const sessionParamsSchema = z.object({ id: z.string().uuid(), sessionId: z.string().uuid() });

/**
 * Integraciones por negocio: WhatsApp (docs/PANEL-OPERADOR.md §7) y Wompi (§D3).
 * Ninguna respuesta devuelve un secreto en claro — solo máscaras.
 */
export async function adminIntegrationsRoutes(app: FastifyInstance): Promise<void> {
  // — WhatsApp —

  app.get("/admin/businesses/:id/whatsapp", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return { data: await listWhatsAppAccounts(id) };
  });

  app.post("/admin/businesses/:id/whatsapp", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = connectWhatsAppSchema.parse(request.body);
    const account = await connectWhatsAppAccount(id, body, request.operator!.userId);
    reply.status(201);
    return { data: account };
  });

  app.patch("/admin/businesses/:id/whatsapp/:accountId", async (request) => {
    const { id, accountId } = accountParamsSchema.parse(request.params);
    const body = updateWhatsAppSchema.parse(request.body);
    return { data: await updateWhatsAppAccount(id, accountId, body, request.operator!.userId) };
  });

  app.delete("/admin/businesses/:id/whatsapp/:accountId", async (request, reply) => {
    const { id, accountId } = accountParamsSchema.parse(request.params);
    await disconnectWhatsAppAccount(id, accountId, request.operator!.userId);
    reply.status(204);
  });

  app.post("/admin/businesses/:id/whatsapp/:accountId/verify", async (request) => {
    const { id, accountId } = accountParamsSchema.parse(request.params);
    return { data: await verifyWhatsAppAccount(id, accountId) };
  });

  // — WhatsApp · Embedded Signup (§7.4) —

  /**
   * Si el flujo está habilitado en este despliegue, y con qué app. El panel lo
   * consulta para decidir si muestra el botón de Facebook o solo el alta manual
   * del puente (§7.3): mejor ocultarlo que ofrecer un botón que va a fallar.
   */
  app.get("/admin/whatsapp/embedded-signup", async () => {
    return { data: getEmbeddedSignupConfig() };
  });

  app.get("/admin/businesses/:id/whatsapp/signup-links", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return { data: await listSignupLinks(id) };
  });

  /**
   * Genera el enlace de un solo uso para el cliente. La URL con el token va en
   * **esta** respuesta y en ninguna más: de ahí en adelante solo queda su hash.
   */
  app.post("/admin/businesses/:id/whatsapp/signup-links", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const session = await createSignupLink(id, request.operator!.userId);
    reply.status(201);
    return { data: session };
  });

  app.delete("/admin/businesses/:id/whatsapp/signup-links/:sessionId", async (request, reply) => {
    const { id, sessionId } = sessionParamsSchema.parse(request.params);
    await revokeSignupLink(id, sessionId, request.operator!.userId);
    reply.status(204);
  });

  /**
   * El mismo callback, pero disparado desde el panel: el operador está con el
   * cliente (o compartiendo pantalla) y el popup de Facebook se abre ahí mismo.
   * El `code` sigue saliendo de la cuenta de Facebook **del cliente** — lo único
   * que cambia es de qué browser viene y quién queda como actor en la auditoría.
   */
  app.post("/admin/businesses/:id/whatsapp/embedded-signup", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = embeddedSignupCallbackSchema.parse(request.body);
    const result = await completeEmbeddedSignup(id, body, request.operator!.userId);
    reply.status(201);
    return { data: result };
  });

  // — Wompi —

  app.get("/admin/businesses/:id/payment-credentials", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return { data: await getPaymentCredentials(id) };
  });

  app.put("/admin/businesses/:id/payment-credentials", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = upsertPaymentCredentialsSchema.parse(request.body);
    return { data: await upsertPaymentCredentials(id, body, request.operator!.userId) };
  });

  app.delete("/admin/businesses/:id/payment-credentials", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return { data: await deletePaymentCredentials(id, request.operator!.userId) };
  });
}
