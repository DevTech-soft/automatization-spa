import type { PaymentEnvironment } from "@spa/db";
import { prisma } from "../db/prisma.js";
import { decryptSecret, encryptSecret } from "../utils/crypto.js";

/**
 * Credenciales de Wompi de un negocio (docs/PANEL-OPERADOR.md §D3): la plata del
 * spa va directo a su cuenta. Las 4 llaves viven cifradas (AES-256-GCM) en la
 * tabla `payment_credentials`; este repo las cifra al escribir y las descifra al
 * leer, para que el resto del backend nunca vea el texto en reposo.
 */
export interface WompiCredentials {
  provider: string;
  apiKey: string;
  publicKey: string;
  integritySecret: string;
  webhookSecret: string;
  environment: PaymentEnvironment;
}

export interface UpsertWompiCredentialsInput {
  apiKey: string;
  publicKey: string;
  integritySecret: string;
  webhookSecret: string;
  environment?: PaymentEnvironment;
}

export const paymentCredentialsRepository = {
  /** Llaves descifradas de un negocio, o `null` si todavía no configura las suyas. */
  async findByBusinessId(businessId: string): Promise<WompiCredentials | null> {
    const row = await prisma.paymentCredentials.findUnique({ where: { businessId } });
    if (!row) {
      return null;
    }
    return {
      provider: row.provider,
      apiKey: decryptSecret(row.apiKeyEnc),
      publicKey: decryptSecret(row.publicKeyEnc),
      integritySecret: decryptSecret(row.integritySecretEnc),
      webhookSecret: decryptSecret(row.webhookSecretEnc),
      environment: row.environment,
    };
  },

  /** Cifra y guarda (o reemplaza) las llaves de un negocio. Lo usa el panel (F3) y el script de migración. */
  upsert(businessId: string, input: UpsertWompiCredentialsInput) {
    const data = {
      provider: "wompi",
      environment: input.environment ?? "PROD",
      apiKeyEnc: encryptSecret(input.apiKey),
      publicKeyEnc: encryptSecret(input.publicKey),
      integritySecretEnc: encryptSecret(input.integritySecret),
      webhookSecretEnc: encryptSecret(input.webhookSecret),
    } as const;

    return prisma.paymentCredentials.upsert({
      where: { businessId },
      create: { businessId, ...data },
      update: data,
    });
  },
};
