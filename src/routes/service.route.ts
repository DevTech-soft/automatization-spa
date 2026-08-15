import type { FastifyInstance } from "fastify";
import { listServicesHandler } from "../controllers/service.controller.js";

export async function serviceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/services", listServicesHandler);
}
