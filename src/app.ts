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
import { agentRoutes } from "./routes/agent.route.js";
import { paymentRoutes } from "./routes/payment.route.js";
import { giftCardRoutes } from "./routes/giftCard.route.js";
import { webRoutes } from "./routes/web.route.js";
import { whatsappRoutes } from "./routes/whatsapp.route.js";

// "src/app.ts" en dev (tsx) y "dist/app.js" en build viven ambos un nivel por
// debajo de la raíz del proyecto, así que "../web" resuelve igual en los dos casos.
const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../web");

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    genReqId: () => randomUUID(),
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      // useDefaults (true por defecto) mezcla esto con las directivas por defecto de helmet.
      directives: {
        // Las imágenes de Gift Cards se sirven desde Supabase Storage (sección 27), no desde "self".
        "img-src": ["'self'", "data:", new URL(env.SUPABASE_URL).origin],
      },
    },
  });
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

  // Reemplaza el parser JSON por defecto para conservar el body sin parsear
  // (`request.rawBody`) — lo necesita el webhook de WhatsApp para validar
  // `X-Hub-Signature-256` (el HMAC se calcula sobre los bytes exactos recibidos).
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const raw = body as string;
    request.rawBody = raw;
    try {
      done(null, raw.length ? JSON.parse(raw) : {});
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  app.setErrorHandler(errorHandler);

  await app.register(healthRoutes);
  await app.register(businessRoutes);
  await app.register(serviceRoutes);
  await app.register(appointmentRoutes);
  await app.register(internalRoutes);
  await app.register(agentRoutes);
  await app.register(paymentRoutes);
  await app.register(giftCardRoutes);
  await app.register(whatsappRoutes);
  await app.register(webRoutes);

  return app;
}
