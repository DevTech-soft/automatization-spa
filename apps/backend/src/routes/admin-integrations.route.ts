import type { FastifyInstance } from "fastify";
import {
  connectWhatsAppSchema,
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
  deletePaymentCredentials,
  getPaymentCredentials,
  upsertPaymentCredentials,
} from "../services/admin-payment-credentials.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const accountParamsSchema = z.object({ id: z.string().uuid(), accountId: z.string().uuid() });

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
