import type { FastifyInstance } from "fastify";
import { updateBusinessHoursSchema, updateServiceSchema, upsertServiceSchema } from "@spa/shared";
import { z } from "zod";
import {
  createCatalogService,
  deleteCatalogService,
  getBusinessHours,
  listCatalogServices,
  updateBusinessHours,
  updateCatalogService,
} from "../services/admin-catalog.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const serviceParamsSchema = z.object({ id: z.string().uuid(), serviceId: z.string().uuid() });

/** Catálogo por negocio: servicios y horarios (docs/PANEL-OPERADOR.md §6.1 pasos 3–4). */
export async function adminCatalogRoutes(app: FastifyInstance): Promise<void> {
  // — Servicios —

  app.get("/admin/businesses/:id/services", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return { data: await listCatalogServices(id) };
  });

  app.post("/admin/businesses/:id/services", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = upsertServiceSchema.parse(request.body);
    const service = await createCatalogService(id, body, request.operator!.userId);
    reply.status(201);
    return { data: service };
  });

  app.patch("/admin/businesses/:id/services/:serviceId", async (request) => {
    const { id, serviceId } = serviceParamsSchema.parse(request.params);
    const body = updateServiceSchema.parse(request.body);
    return { data: await updateCatalogService(id, serviceId, body, request.operator!.userId) };
  });

  /** 409 si el servicio tiene citas: se desactiva en vez de borrarse. */
  app.delete("/admin/businesses/:id/services/:serviceId", async (request, reply) => {
    const { id, serviceId } = serviceParamsSchema.parse(request.params);
    await deleteCatalogService(id, serviceId, request.operator!.userId);
    reply.status(204);
  });

  // — Horarios —

  app.get("/admin/businesses/:id/hours", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return { data: await getBusinessHours(id) };
  });

  app.put("/admin/businesses/:id/hours", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = updateBusinessHoursSchema.parse(request.body);
    return { data: await updateBusinessHours(id, body, request.operator!.userId) };
  });
}
