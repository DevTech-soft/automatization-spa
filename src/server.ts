import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { prisma } from "./db/prisma.js";
import { startScheduledJobs } from "./jobs/scheduler.js";

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    // "::" y no "0.0.0.0": la red privada de Railway es IPv6, y n8n llama a
    // este servicio por http://<servicio>.railway.internal. Escuchando solo en
    // IPv4 esas llamadas fallan con ECONNREFUSED. El dual-stack de Node deja
    // el puerto igualmente accesible por IPv4.
    await app.listen({ port: env.PORT, host: "::" });
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "server_started");
    startScheduledJobs();
  } catch (error) {
    logger.error({ err: error }, "server_start_failed");
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "server_shutting_down");
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
