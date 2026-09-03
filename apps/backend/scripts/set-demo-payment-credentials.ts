/**
 * Migración puntual de F2 (docs/PANEL-OPERADOR.md §D3).
 *
 * Toma las llaves globales `PAYMENT_*` del entorno y las guarda **cifradas**
 * (AES-256-GCM) como `PaymentCredentials` de un negocio, para ejercitar el
 * camino de credenciales por-tenant en producción antes de que exista el panel
 * (F3). Idempotente (upsert).
 *
 * Uso:
 *   pnpm --filter @spa/backend script:demo-payment-credentials [slug]
 *
 * Requiere en el entorno (apps/backend/.env o Railway):
 *   SECRETS_ENCRYPTION_KEY  y  PAYMENT_API_KEY / PAYMENT_PUBLIC_KEY /
 *   PAYMENT_INTEGRITY_SECRET / PAYMENT_WEBHOOK_SECRET
 *
 * El fallback a env sigue funcionando para negocios sin fila, así que borrar la
 * fila revierte al comportamiento anterior sin desplegar.
 */
import { prisma } from "../src/db/prisma.js";
import { paymentCredentialsRepository } from "../src/repositories/paymentCredentials.repository.js";
import { env } from "../src/config/env.js";

async function main(): Promise<void> {
  const slug = process.argv[2] ?? "demo-spa";

  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business) {
    throw new Error(`No existe un negocio con slug "${slug}".`);
  }

  const keys = {
    apiKey: env.PAYMENT_API_KEY,
    publicKey: env.PAYMENT_PUBLIC_KEY,
    integritySecret: env.PAYMENT_INTEGRITY_SECRET,
    webhookSecret: env.PAYMENT_WEBHOOK_SECRET,
  };

  const missing = Object.entries(keys)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno: ${missing.join(", ")}.`);
  }

  await paymentCredentialsRepository.upsert(business.id, {
    apiKey: keys.apiKey as string,
    publicKey: keys.publicKey as string,
    integritySecret: keys.integritySecret as string,
    webhookSecret: keys.webhookSecret as string,
    environment: "PROD",
  });

  console.log(`PaymentCredentials cifradas y guardadas para "${slug}" (${business.id}).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
