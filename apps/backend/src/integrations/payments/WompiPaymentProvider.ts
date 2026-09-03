import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  WebhookEvent,
  WebhookEventStatus,
} from "./PaymentProvider.js";

export interface WompiConfig {
  publicKey: string;
  integritySecret: string;
  eventsSecret: string;
  checkoutBaseUrl?: string;
}

const DEFAULT_CHECKOUT_BASE_URL = "https://checkout.wompi.co/p/";

const wompiWebhookSchema = z.object({
  event: z.string(),
  data: z.object({
    transaction: z.object({
      id: z.string(),
      reference: z.string(),
      status: z.enum(["APPROVED", "DECLINED", "VOIDED", "ERROR", "PENDING"]),
      amount_in_cents: z.number(),
      currency: z.string(),
    }),
  }),
  signature: z.object({
    properties: z.array(z.string()),
    checksum: z.string(),
  }),
  timestamp: z.number(),
});

type WompiWebhookPayload = z.infer<typeof wompiWebhookSchema>;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Resuelve un path tipo "transaction.id" contra un objeto anidado. */
function getByPath(source: unknown, path: string): string {
  const value = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);

  return value === undefined || value === null ? "" : String(value);
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Adapter de Wompi (Colombia). Usa el "Web Checkout" de Wompi (redirección
 * firmada) en vez de crear transacciones vía API server-to-server — no
 * requiere llamadas salientes adicionales y simplifica el MVP.
 *
 * Referencia: docs/PAYMENTS.md
 */
export class WompiPaymentProvider implements PaymentProvider {
  readonly name = "wompi";

  constructor(private readonly config: WompiConfig) {}

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const amountInCents = Math.round(input.amount * 100);
    const integrity = sha256Hex(
      `${input.reference}${amountInCents}${input.currency}${this.config.integritySecret}`,
    );

    const url = new URL(this.config.checkoutBaseUrl ?? DEFAULT_CHECKOUT_BASE_URL);
    url.searchParams.set("public-key", this.config.publicKey);
    url.searchParams.set("currency", input.currency);
    url.searchParams.set("amount-in-cents", String(amountInCents));
    url.searchParams.set("reference", input.reference);
    url.searchParams.set("redirect-url", input.redirectUrl);
    url.searchParams.set("signature:integrity", integrity);
    if (input.customerEmail) {
      url.searchParams.set("customer-data:email", input.customerEmail);
    }

    return Promise.resolve({ paymentUrl: url.toString(), provider: this.name, reference: input.reference });
  }

  validateWebhook(rawPayload: unknown): boolean {
    const parsed = wompiWebhookSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return false;
    }

    const payload = parsed.data;
    const concatenatedValues = payload.signature.properties
      .map((path) => getByPath(payload.data, path))
      .join("");
    const toHash = `${concatenatedValues}${payload.timestamp}${this.config.eventsSecret}`;
    const expectedChecksum = sha256Hex(toHash).toUpperCase();

    return safeEqual(expectedChecksum, payload.signature.checksum.toUpperCase());
  }

  parseWebhook(rawPayload: unknown): WebhookEvent {
    const payload: WompiWebhookPayload = wompiWebhookSchema.parse(rawPayload);
    const tx = payload.data.transaction;

    return {
      provider: this.name,
      reference: tx.reference,
      transactionId: tx.id,
      status: mapWompiStatus(tx.status),
      amountInCents: tx.amount_in_cents,
      currency: tx.currency,
      raw: payload,
    };
  }
}

function mapWompiStatus(status: WompiWebhookPayload["data"]["transaction"]["status"]): WebhookEventStatus {
  return status;
}

/**
 * Extrae `data.transaction.reference` de un payload de Wompi sin validar nada
 * (§6.3). Tolerante: devuelve null si el payload no tiene la forma esperada.
 */
export function extractWompiReference(rawPayload: unknown): string | null {
  if (typeof rawPayload !== "object" || rawPayload === null) {
    return null;
  }
  const data = (rawPayload as Record<string, unknown>)["data"];
  const transaction =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)["transaction"]
      : undefined;
  const reference =
    typeof transaction === "object" && transaction !== null
      ? (transaction as Record<string, unknown>)["reference"]
      : undefined;
  return typeof reference === "string" && reference.length > 0 ? reference : null;
}
