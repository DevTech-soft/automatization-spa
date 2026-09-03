import type { FastifyInstance } from "fastify";
import { getBusinessHandler } from "../controllers/business.controller.js";

export async function businessRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/business/:slug", getBusinessHandler);
}
