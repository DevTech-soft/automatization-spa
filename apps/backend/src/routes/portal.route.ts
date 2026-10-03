import type { FastifyInstance } from "fastify";
import {
  activityQuerySchema,
  appointmentActionSchema,
  chatDetailQuerySchema,
  chatPhoneParamSchema,
  paginationQuerySchema,
  usageQuerySchema,
} from "@spa/shared";
import { z } from "zod";
import { requirePortalOwner, requirePortalSession } from "../middlewares/portal-auth.js";
import {
  listAppointments,
  listConversations,
  listGiftCards,
  listPayments,
} from "../services/admin-activity.service.js";
import { getBusinessUsage } from "../services/admin-metrics.service.js";
import { getChat, listChats } from "../services/chat.service.js";
import { applyAppointmentAction } from "../services/appointment-actions.service.js";
import { getCustomer, getPortalMe, listCustomers } from "../services/portal.service.js";

const customerParamSchema = z.object({ customerId: z.string().uuid() });
const chatParamSchema = z.object({ phone: chatPhoneParamSchema });
const appointmentParamSchema = z.object({ appointmentId: z.string().uuid() });

/**
 * API del portal de cliente / CRM (docs/PANEL-OPERADOR.md F7, §8.5). Mismo
 * consumo que `/admin/*` —el panel la llama vía BFF con la cookie de sesión—,
 * pero el negocio NUNCA viene en la URL: lo fija `requirePortalSession` desde
 * la membresía del usuario (`request.portal.businessId`). Por eso las rutas
 * reutilizan los servicios de actividad/métricas del operador sin riesgo de
 * cruzar tenants.
 *
 * Equipo (`member`) ve la operación del día: citas, clientas, conversaciones.
 * Lo que es plata —pagos, gift cards, métricas de ingresos— es solo del dueño(a).
 */
export async function portalRoutes(app: FastifyInstance): Promise<void> {
  app.register(async (portal) => {
    portal.addHook("preHandler", requirePortalSession);

    portal.get("/portal/me", async (request) => ({ data: getPortalMe(request.portal!) }));

    portal.get("/portal/appointments", async (request) => {
      const query = paginationQuerySchema.parse(request.query);
      const filters = activityQuerySchema.parse(request.query);
      return { data: await listAppointments(request.portal!.businessId, query, filters) };
    });

    portal.get("/portal/conversations", async (request) => {
      const query = paginationQuerySchema.parse(request.query);
      const filters = activityQuerySchema.parse(request.query);
      return { data: await listConversations(request.portal!.businessId, query, filters) };
    });

    /**
     * Atendida / no asistió / cancelar / deshacer. Todo el equipo: es la tarea
     * de la recepción. Queda en el audit log con el usuario que lo hizo.
     */
    portal.post("/portal/appointments/:appointmentId/actions", async (request) => {
      const { appointmentId } = appointmentParamSchema.parse(request.params);
      const body = appointmentActionSchema.parse(request.body);
      const portalUser = request.portal!;
      return {
        data: await applyAppointmentAction(portalUser.businessId, appointmentId, body, portalUser.email),
      };
    });

    // Transcripción de WhatsApp (F7): lo ve todo el equipo, como las citas.
    portal.get("/portal/chats", async (request) => {
      const query = paginationQuerySchema.parse(request.query);
      return { data: await listChats(request.portal!.businessId, query) };
    });

    portal.get("/portal/chats/:phone", async (request) => {
      const { phone } = chatParamSchema.parse(request.params);
      const query = chatDetailQuerySchema.parse(request.query);
      return { data: await getChat(request.portal!.businessId, phone, query) };
    });

    portal.get("/portal/customers", async (request) => {
      const query = paginationQuerySchema.parse(request.query);
      return { data: await listCustomers(request.portal!.businessId, query) };
    });

    portal.get("/portal/customers/:customerId", async (request) => {
      const { customerId } = customerParamSchema.parse(request.params);
      return { data: await getCustomer(request.portal!.businessId, customerId) };
    });

    // — Solo dueño(a) —

    portal.get("/portal/usage", { preHandler: requirePortalOwner }, async (request) => {
      const { days } = usageQuerySchema.parse(request.query);
      return { data: await getBusinessUsage(request.portal!.businessId, days) };
    });

    portal.get("/portal/transactions", { preHandler: requirePortalOwner }, async (request) => {
      const query = paginationQuerySchema.parse(request.query);
      const filters = activityQuerySchema.parse(request.query);
      return { data: await listPayments(request.portal!.businessId, query, filters) };
    });

    portal.get("/portal/gift-cards", { preHandler: requirePortalOwner }, async (request) => {
      const query = paginationQuerySchema.parse(request.query);
      const filters = activityQuerySchema.parse(request.query);
      return { data: await listGiftCards(request.portal!.businessId, query, filters) };
    });
  });
}
