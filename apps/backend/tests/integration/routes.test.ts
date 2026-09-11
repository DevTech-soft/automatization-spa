import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/business.service.js", () => ({
  getBusinessBySlug: vi.fn().mockResolvedValue({ id: "biz-1", slug: "demo-spa", name: "Demo Spa" }),
}));
vi.mock("../../src/services/service.service.js", () => ({
  listServices: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../src/services/availability.service.js", () => ({
  getAvailability: vi.fn().mockResolvedValue({ slots: [] }),
}));
vi.mock("../../src/services/appointment.service.js", () => ({
  createAppointment: vi.fn().mockResolvedValue({ id: "appt-1", appointmentCode: "APT-ABC12345" }),
  expireStalePendingAppointments: vi.fn().mockResolvedValue(2),
  sendUpcomingAppointmentReminders: vi.fn().mockResolvedValue(3),
  getAppointmentStatusByReference: vi.fn().mockResolvedValue({
    appointmentCode: "APT-ABC12345",
    status: "CONFIRMED",
    paymentStatus: "PAID",
    serviceName: "Masaje relajante",
    date: "2026-01-05",
    startTime: "10:00",
    endTime: "11:00",
    price: "90000",
  }),
}));
vi.mock("../../src/services/payment.service.js", () => ({
  createPayment: vi.fn().mockResolvedValue({ paymentUrl: "https://checkout.wompi.co/p/xyz", reference: "PAY-1" }),
  processPaymentWebhook: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/services/whatsapp-conversation.service.js", () => ({
  handleIncomingWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/services/gift-card.service.js", () => ({
  createGiftCard: vi.fn().mockResolvedValue({ id: "gift-1", code: "GIFT-ABC12345" }),
  getGiftCardStatusByReference: vi.fn().mockResolvedValue({
    code: "GIFT-ABC12345",
    status: "SENT",
    paymentStatus: "PAID",
    serviceName: "Masaje relajante",
    recipientName: "Luis",
    amount: "90000",
    pdfUrl: "https://storage.example/gift.png",
  }),
  validateGiftCard: vi.fn().mockResolvedValue({
    valid: true,
    status: "SENT",
    serviceName: "Masaje relajante",
    recipientName: "Luis",
    buyerName: "Ana",
    amount: "90000",
    purchasedAt: "2026-01-04T12:00:00.000Z",
    expiresAt: null,
  }),
  redeemGiftCard: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/integrations/whatsapp/index.js", () => ({
  getWhatsAppWebhookReader: vi.fn(() => ({ validateWebhookSignature: vi.fn().mockReturnValue(true) })),
}));
vi.mock("../../src/services/whatsapp-signup.service.js", () => ({
  getSignupInvite: vi.fn().mockResolvedValue({
    businessName: "Spa Demo",
    status: "PENDING",
    expiresAt: "2026-09-11T00:00:00.000Z",
    unavailableReason: null,
    config: { enabled: true, appId: "app-1", configId: "config-1", graphVersion: "v21.0" },
  }),
  completeSignupFromInvite: vi.fn().mockResolvedValue({ account: { id: "wa-1" }, steps: [] }),
}));
vi.mock("../../src/db/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) },
}));

const { buildApp } = await import("../../src/app.js");
const { createPayment, processPaymentWebhook } = await import("../../src/services/payment.service.js");
const { handleIncomingWhatsAppMessage } = await import("../../src/services/whatsapp-conversation.service.js");
const { getWhatsAppWebhookReader } = await import("../../src/integrations/whatsapp/index.js");
const { createGiftCard, redeemGiftCard } = await import("../../src/services/gift-card.service.js");
const { getSignupInvite } = await import("../../src/services/whatsapp-signup.service.js");

describe("rutas de Fase 2", () => {
  it("GET /api/business/:slug responde 200 con los datos del negocio", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/business/demo-spa" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { id: "biz-1", slug: "demo-spa", name: "Demo Spa" } });
    await app.close();
  });

  it("GET /api/services sin businessId responde 400", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/services" });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    await app.close();
  });

  it("GET /api/appointments/availability con fecha inválida responde 400", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/appointments/availability?businessId=11111111-1111-1111-1111-111111111111&serviceId=22222222-2222-2222-2222-222222222222&date=05-01-2026",
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("GET /api/appointments/availability con parámetros válidos responde 200", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/appointments/availability?businessId=11111111-1111-1111-1111-111111111111&serviceId=22222222-2222-2222-2222-222222222222&date=2026-01-05",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { slots: [] } });
    await app.close();
  });

  it("POST /api/appointments con body inválido responde 400", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/api/appointments", payload: {} });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("POST /api/appointments con body válido responde 201", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/appointments",
      payload: {
        businessId: "11111111-1111-1111-1111-111111111111",
        serviceId: "22222222-2222-2222-2222-222222222222",
        date: "2026-01-05",
        startTime: "10:00",
        customerName: "Cliente de Prueba",
        customerPhone: "+573001112233",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ data: { id: "appt-1", appointmentCode: "APT-ABC12345" } });
    await app.close();
  });

  it("GET /api/appointments/status sin reference responde 400", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/appointments/status" });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("GET /api/appointments/status con reference responde 200", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/appointments/status?reference=PAY-ABC12345" });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.appointmentCode).toBe("APT-ABC12345");
    await app.close();
  });

  it("POST /internal/jobs/expire-appointments sin token responde 401", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/internal/jobs/expire-appointments" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("POST /internal/jobs/expire-appointments con token válido responde 200", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/internal/jobs/expire-appointments",
      headers: { authorization: `Bearer ${process.env.INTERNAL_JOBS_TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { expiredCount: 2 } });
    await app.close();
  });

  it("POST /internal/jobs/send-reminders sin token responde 401", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/internal/jobs/send-reminders" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("POST /internal/jobs/send-reminders con token válido responde 200", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/internal/jobs/send-reminders",
      headers: { authorization: `Bearer ${process.env.INTERNAL_JOBS_TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { remindersSent: 3 } });
    await app.close();
  });
});

describe("rutas de Fase 4 — Payments", () => {
  it("POST /api/payments/create con body inválido responde 400", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/api/payments/create", payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    await app.close();
  });

  it("POST /api/payments/create con body válido responde 201 con el link de pago", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/payments/create",
      payload: { entityType: "APPOINTMENT", entityId: "44444444-4444-4444-4444-444444444444" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      data: { paymentUrl: "https://checkout.wompi.co/p/xyz", reference: "PAY-1" },
    });
    expect(createPayment).toHaveBeenCalledWith({
      entityType: "APPOINTMENT",
      entityId: "44444444-4444-4444-4444-444444444444",
    });
    await app.close();
  });

  it("POST /api/webhooks/payment siempre responde 200 (el proveedor reintenta si no)", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/payment",
      payload: { event: "transaction.updated" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
    expect(processPaymentWebhook).toHaveBeenCalledWith({ event: "transaction.updated" });
    await app.close();
  });
});

describe("rutas de Fase 6 — WhatsApp", () => {
  it("GET /api/webhooks/whatsapp con verify_token correcto responde con el challenge", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-whatsapp-verify-token&hub.challenge=abc123",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("abc123");
    await app.close();
  });

  it("GET /api/webhooks/whatsapp con verify_token incorrecto responde 403", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123",
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("POST /api/webhooks/whatsapp con firma inválida responde 401", async () => {
    vi.mocked(getWhatsAppWebhookReader).mockReturnValueOnce({
      validateWebhookSignature: vi.fn().mockReturnValue(false),
    } as never);
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/api/webhooks/whatsapp", payload: { entry: [] } });

    expect(response.statusCode).toBe(401);
    expect(handleIncomingWhatsAppMessage).not.toHaveBeenCalled();
    await app.close();
  });

  it("POST /api/webhooks/whatsapp con firma válida responde 200 y procesa el mensaje", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/api/webhooks/whatsapp", payload: { entry: [] } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
    expect(handleIncomingWhatsAppMessage).toHaveBeenCalledWith({ entry: [] });
    await app.close();
  });

  it("POST /api/webhooks/whatsapp responde 200 aunque falle el procesamiento (Meta no debe reintentar)", async () => {
    vi.mocked(handleIncomingWhatsAppMessage).mockRejectedValueOnce(new Error("boom"));
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/api/webhooks/whatsapp", payload: { entry: [] } });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});

describe("rutas de Fase 8 — Gift Cards", () => {
  it("POST /api/gift-cards con body inválido responde 400", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/api/gift-cards", payload: {} });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("POST /api/gift-cards con body válido responde 201", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/gift-cards",
      payload: {
        businessId: "11111111-1111-1111-1111-111111111111",
        serviceId: "22222222-2222-2222-2222-222222222222",
        design: "clasico",
        buyerName: "Ana",
        buyerPhone: "+573001112233",
        recipientName: "Luis",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ data: { id: "gift-1", code: "GIFT-ABC12345" } });
    expect(createGiftCard).toHaveBeenCalled();
    await app.close();
  });

  it("GET /api/gift-cards/status sin reference responde 400", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/gift-cards/status" });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("GET /api/gift-cards/status con reference responde 200", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/gift-cards/status?reference=PAY-ABC12345" });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.code).toBe("GIFT-ABC12345");
    await app.close();
  });

  it("POST /api/gift-cards/validate con body inválido responde 400", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/api/gift-cards/validate", payload: {} });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("POST /api/gift-cards/validate con código responde 200", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/gift-cards/validate",
      payload: { code: "GIFT-ABC12345" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.valid).toBe(true);
    await app.close();
  });

  it("POST /api/gift-cards/redeem sin staffPin responde 400", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/gift-cards/redeem",
      payload: { code: "GIFT-ABC12345" },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("POST /api/gift-cards/redeem con datos válidos responde 200", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/gift-cards/redeem",
      payload: { code: "GIFT-ABC12345", staffPin: "1234" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { redeemed: true } });
    expect(redeemGiftCard).toHaveBeenCalledWith("GIFT-ABC12345", "1234");
    await app.close();
  });

  it("POST /api/gift-cards/redeem tiene un límite de tasa propio, más estricto que el global (fuerza bruta de STAFF_PIN)", async () => {
    const app = await buildApp();
    const payload = { code: "GIFT-ABC12345", staffPin: "0000" };

    let lastResponse;
    for (let i = 0; i < 6; i++) {
      lastResponse = await app.inject({ method: "POST", url: "/api/gift-cards/redeem", payload });
    }

    expect(lastResponse!.statusCode).toBe(429);
    await app.close();
  });
});

/**
 * Embedded Signup (docs/PANEL-OPERADOR.md §7.4). Lo que se prueba acá es la
 * superficie pública: son las únicas rutas del flujo sin sesión, así que lo
 * interesante es qué acepta y con qué política de contenido sirve la página.
 */
describe("auto-conexión de WhatsApp", () => {
  const TOKEN = "P5rGgBtFa0kQ5rHhV2jWn8LmXcYdTgUiOpAsDfGhJkL";

  it("GET /conectar/:token sirve la página y afloja la CSP solo para Facebook", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: `/conectar/${TOKEN}` });

    expect(response.statusCode).toBe(200);
    const csp = response.headers["content-security-policy"] as string;
    expect(csp).toContain("https://connect.facebook.net");
    expect(csp).toContain("frame-src https://www.facebook.com");
    await app.close();
  });

  it("la CSP de las demás páginas sigue sin permitir scripts de terceros", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/reservar" });

    expect(response.headers["content-security-policy"]).not.toContain("facebook");
    await app.close();
  });

  it("GET /api/whatsapp/signup/:token devuelve la portada del enlace", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: `/api/whatsapp/signup/${TOKEN}` });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.businessName).toBe("Spa Demo");
    expect(getSignupInvite).toHaveBeenCalledWith(TOKEN);
    await app.close();
  });

  it("un token con forma inválida se rechaza sin consultar la base", async () => {
    const app = await buildApp();
    vi.mocked(getSignupInvite).mockClear();
    const response = await app.inject({ method: "GET", url: "/api/whatsapp/signup/nope" });

    expect(response.statusCode).toBe(400);
    expect(getSignupInvite).not.toHaveBeenCalled();
    await app.close();
  });

  it("POST /api/whatsapp/signup/:token exige los tres datos del popup", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/api/whatsapp/signup/${TOKEN}`,
      payload: { code: "AQDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
