import type { FastifyInstance } from "fastify";
import { activityQuerySchema, auditQuerySchema, paginationQuerySchema, usageQuerySchema } from "@spa/shared";
import { z } from "zod";
import {
  listAppointments,
  listConversations,
  listGiftCards,
  listPayments,
} from "../services/admin-activity.service.js";
import { getBusinessUsage, getOverview } from "../services/admin-metrics.service.js";
import { listAuditLogs } from "../services/admin-audit.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * Métricas, consumo y actividad (docs/PANEL-OPERADOR.md §1, F3e/F6). Las rutas
 * por negocio son las que en F7 reutiliza el portal del cliente con un guard de
 * rol distinto — por eso todas nacen filtradas por `businessId`.
 */
export async function adminActivityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/metrics/overview", async (request) => {
    const { days } = usageQuerySchema.parse(request.query);
    return { data: await getOverview(days) };
  });

  app.get("/admin/businesses/:id/usage", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { days } = usageQuerySchema.parse(request.query);
    return { data: await getBusinessUsage(id, days) };
  });

  app.get("/admin/businesses/:id/appointments", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    const filters = activityQuerySchema.parse(request.query);
    return { data: await listAppointments(id, query, filters) };
  });

  app.get("/admin/businesses/:id/transactions", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    const filters = activityQuerySchema.parse(request.query);
    return { data: await listPayments(id, query, filters) };
  });

  app.get("/admin/businesses/:id/conversations", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    const filters = activityQuerySchema.parse(request.query);
    return { data: await listConversations(id, query, filters) };
  });

  app.get("/admin/businesses/:id/gift-cards", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    const filters = activityQuerySchema.parse(request.query);
    return { data: await listGiftCards(id, query, filters) };
  });

  app.get("/admin/audit-logs", async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    const filters = auditQuerySchema.parse(request.query);
    return { data: await listAuditLogs(query, filters) };
  });
}
