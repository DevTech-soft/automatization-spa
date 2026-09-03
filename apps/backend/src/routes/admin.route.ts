import type { FastifyInstance } from "fastify";
import { requireOperatorSession } from "../middlewares/admin-auth.js";
import type { AdminMeResponse } from "@spa/shared";

/**
 * API del panel de operador (docs/PANEL-OPERADOR.md §8). Todas las rutas pasan
 * por `requireOperatorSession`. El panel (Vercel) las consume vía BFF —
 * sus route handlers de Next reenvían aquí con la sesión adjunta.
 *
 * F3a: solo `/admin/me`. El CRUD de negocios, branding, onboarding y dashboards
 * llega en los siguientes entregables de F3.
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
  });
}
