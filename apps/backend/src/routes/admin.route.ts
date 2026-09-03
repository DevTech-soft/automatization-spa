import type { FastifyInstance } from "fastify";
import {
  createBusinessSchema,
  onboardingManualSchema,
  paginationQuerySchema,
  updateBrandingSchema,
  updateBusinessSchema,
} from "@spa/shared";
import type { AdminMeResponse } from "@spa/shared";
import { z } from "zod";
import { requireOperatorSession } from "../middlewares/admin-auth.js";
import {
  createBusiness,
  getBusiness,
  listBusinesses,
  updateBusiness,
} from "../services/admin-business.service.js";
import { getBranding, updateBranding } from "../services/admin-branding.service.js";
import {
  activateBusiness,
  getOnboardingChecklist,
  updateOnboardingManual,
} from "../services/admin-onboarding.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * API del panel de operador (docs/PANEL-OPERADOR.md §8). Todas las rutas pasan
 * por `requireOperatorSession`. El panel (Vercel) las consume vía BFF —
 * sus route handlers / server components de Next reenvían aquí con la sesión.
 *
 * F3c: `/admin/me` + CRUD de negocios. F3d: marca y checklist de onboarding
 * (§6.1). Los dashboards de cartera/ingresos llegan en F3e.
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

    // — Marca (§6.1 paso 2) —

    admin.get("/admin/businesses/:id/branding", async (request) => {
      const { id } = idParamSchema.parse(request.params);
      return { data: await getBranding(id) };
    });

    admin.patch("/admin/businesses/:id/branding", async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const body = updateBrandingSchema.parse(request.body);
      return { data: await updateBranding(id, body, request.operator!.userId) };
    });

    // — Checklist de onboarding (§6.1) —

    admin.get("/admin/businesses/:id/onboarding", async (request) => {
      const { id } = idParamSchema.parse(request.params);
      return { data: await getOnboardingChecklist(id) };
    });

    admin.patch("/admin/businesses/:id/onboarding", async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const body = onboardingManualSchema.parse(request.body);
      return { data: await updateOnboardingManual(id, body, request.operator!.userId) };
    });

    admin.post("/admin/businesses/:id/activate", async (request) => {
      const { id } = idParamSchema.parse(request.params);
      return { data: await activateBusiness(id, request.operator!.userId) };
    });
  });
}
