import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { loggerOptions } from "./utils/logger.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { healthRoutes } from "./routes/health.route.js";
import { businessRoutes } from "./routes/business.route.js";
import { serviceRoutes } from "./routes/service.route.js";
import { appointmentRoutes } from "./routes/appointment.route.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    genReqId: () => randomUUID(),
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.NODE_ENV === "production" ? [env.APP_URL] : true,
  });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  app.setErrorHandler(errorHandler);

  await app.register(healthRoutes);
  await app.register(businessRoutes);
  await app.register(serviceRoutes);
  await app.register(appointmentRoutes);

  return app;
}
