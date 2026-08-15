import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.status(200).send({ status: "ok", db: "ok" });
    } catch (error) {
      app.log.error({ err: error }, "health_check_db_failed");
      return reply.status(503).send({ status: "degraded", db: "unreachable" });
    }
  });
}
