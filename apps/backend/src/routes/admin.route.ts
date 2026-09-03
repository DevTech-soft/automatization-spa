import type { FastifyInstance } from "fastify";
import { createBusinessSchema, paginationQuerySchema, updateBusinessSchema } from "@spa/shared";
import type { AdminMeResponse } from "@spa/shared";
import { z } from "zod";
import { requireOperatorSession } from "../middlewares/admin-auth.js";
import {
  createBusiness,
  getBusiness,
  listBusinesses,
  updateBusiness,
} from "../services/admin-business.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * API del panel de operador (docs/PANEL-OPERADOR.md §8). Todas las rutas pasan
 * por `requireOperatorSession`. El panel (Vercel) las consume vía BFF —
 * sus route handlers / server components de Next reenvían aquí con la sesión.
 *
 * F3c: `/admin/me` + CRUD de negocios. Branding, onboarding y dashboards vienen
 * en los siguientes entregables de F3.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.register(async (admin) => {
    admin.addHook("preHandler", requireOperatorSession);

    admin.get("/admin/me", async (request): Promise<{ data: AdminMeResponse }> => {
      const operator = request.operator!;
      return {
        data: {
          userId: operator.userId,
          email: operator.email,
          activeOrganizationId: operator.activeOrganizationId,
        },
      };
    });

    admin.get("/admin/businesses", async (request) => {
      const query = paginationQuerySchema.parse(request.query);
      return { data: await listBusinesses(query) };
    });

    admin.get("/admin/businesses/:id", async (request) => {
      const { id } = idParamSchema.parse(request.params);
      return { data: await getBusiness(id) };
    });

    admin.post("/admin/businesses", async (request, reply) => {
      const body = createBusinessSchema.parse(request.body);
      const business = await createBusiness(body, request.operator!.userId);
      reply.status(201);
      return { data: business };
    });

    admin.patch("/admin/businesses/:id", async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const body = updateBusinessSchema.parse(request.body);
      return { data: await updateBusiness(id, body, request.operator!.userId) };
    });
  });
}
