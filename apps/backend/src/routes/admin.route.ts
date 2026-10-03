import type { FastifyInstance } from "fastify";
import {
  changeStatusSchema,
  createBusinessSchema,
  createBusinessUserSchema,
  onboardingManualSchema,
  paginationQuerySchema,
  updateBrandingSchema,
  updateBusinessSchema,
  updateBusinessUserSchema,
  upsertContactSchema,
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
import { changeBusinessStatus } from "../services/admin-status.service.js";
import {
  createContact,
  deleteContact,
  listContacts,
  updateContact,
} from "../services/admin-contact.service.js";
import {
  createBusinessUser,
  listBusinessUsers,
  removeBusinessUser,
  resetBusinessUserPassword,
  updateBusinessUser,
} from "../services/admin-users.service.js";
import { adminBillingRoutes } from "./admin-billing.route.js";
import { adminActivityRoutes } from "./admin-activity.route.js";
import { adminIntegrationsRoutes } from "./admin-integrations.route.js";
import { adminCatalogRoutes } from "./admin-catalog.route.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const contactParamsSchema = z.object({ id: z.string().uuid(), contactId: z.string().uuid() });
const userParamsSchema = z.object({ id: z.string().uuid(), userId: z.string().min(1).max(64) });

/**
 * API del panel de operador (docs/PANEL-OPERADOR.md §8). Todas las rutas pasan
 * por `requireOperatorSession`. El panel (Vercel) las consume vía BFF —
 * sus route handlers / server components de Next reenvían aquí con la sesión.
 *
 * Este módulo tiene el guard y el CRUD del negocio; el resto se registra como
 * plugins hijos dentro del mismo scope (y por tanto bajo el mismo guard):
 * cartera (`admin-billing`), métricas y actividad (`admin-activity`) e
 * integraciones por-tenant (`admin-integrations`) y catálogo de servicios y
 * horarios (`admin-catalog`).
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

    /**
     * Transiciones de la máquina de estados (§5): suspender, reactivar,
     * cancelar. Separado del PATCH porque corta el servicio a un cliente real y
     * exige motivo (§9).
     */
    admin.post("/admin/businesses/:id/status", async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const body = changeStatusSchema.parse(request.body);
      return { data: await changeBusinessStatus(id, body, request.operator!.userId) };
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

    // — Contactos del cliente (§4, lado CRM) —

    admin.get("/admin/businesses/:id/contacts", async (request) => {
      const { id } = idParamSchema.parse(request.params);
      return { data: await listContacts(id) };
    });

    admin.post("/admin/businesses/:id/contacts", async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const body = upsertContactSchema.parse(request.body);
      const contact = await createContact(id, body, request.operator!.userId);
      reply.status(201);
      return { data: contact };
    });

    admin.patch("/admin/businesses/:id/contacts/:contactId", async (request) => {
      const { id, contactId } = contactParamsSchema.parse(request.params);
      const body = upsertContactSchema.parse(request.body);
      return { data: await updateContact(id, contactId, body, request.operator!.userId) };
    });

    admin.delete("/admin/businesses/:id/contacts/:contactId", async (request, reply) => {
      const { id, contactId } = contactParamsSchema.parse(request.params);
      await deleteContact(id, contactId, request.operator!.userId);
      reply.status(204);
    });

    // — Usuarios del portal del cliente (F7) —

    admin.get("/admin/businesses/:id/users", async (request) => {
      const { id } = idParamSchema.parse(request.params);
      return { data: await listBusinessUsers(id) };
    });

    /** Devuelve la contraseña temporal en claro una única vez. */
    admin.post("/admin/businesses/:id/users", async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const body = createBusinessUserSchema.parse(request.body);
      const result = await createBusinessUser(id, body, request.operator!.userId);
      reply.status(201);
      return { data: result };
    });

    admin.patch("/admin/businesses/:id/users/:userId", async (request) => {
      const { id, userId } = userParamsSchema.parse(request.params);
      const body = updateBusinessUserSchema.parse(request.body);
      return { data: await updateBusinessUser(id, userId, body, request.operator!.userId) };
    });

    admin.post("/admin/businesses/:id/users/:userId/reset-password", async (request) => {
      const { id, userId } = userParamsSchema.parse(request.params);
      return { data: await resetBusinessUserPassword(id, userId, request.operator!.userId) };
    });

    admin.delete("/admin/businesses/:id/users/:userId", async (request, reply) => {
      const { id, userId } = userParamsSchema.parse(request.params);
      await removeBusinessUser(id, userId, request.operator!.userId);
      reply.status(204);
    });

    await admin.register(adminBillingRoutes);
    await admin.register(adminActivityRoutes);
    await admin.register(adminIntegrationsRoutes);
    await admin.register(adminCatalogRoutes);
  });
}
