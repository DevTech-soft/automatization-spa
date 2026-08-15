import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { env } from "./config/env.js";
import { loggerOptions } from "./utils/logger.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { healthRoutes } from "./routes/health.route.js";
import { businessRoutes } from "./routes/business.route.js";
import { serviceRoutes } from "./routes/service.route.js";
import { appointmentRoutes } from "./routes/appointment.route.js";
import { internalRoutes } from "./routes/internal.route.js";
import { paymentRoutes } from "./routes/payment.route.js";
import { webRoutes } from "./routes/web.route.js";

// "src/app.ts" en dev (tsx) y "dist/app.js" en build viven ambos un nivel por
// debajo de la raíz del proyecto, así que "../web" resuelve igual en los dos casos.
const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../web");

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
  await app.register(fastifyStatic, {
    root: WEB_DIR,
    prefix: "/",
    index: false,
  });

  app.setErrorHandler(errorHandler);

  await app.register(healthRoutes);
  await app.register(businessRoutes);
  await app.register(serviceRoutes);
  await app.register(appointmentRoutes);
  await app.register(internalRoutes);
  await app.register(paymentRoutes);
  await app.register(webRoutes);

  return app;
}
