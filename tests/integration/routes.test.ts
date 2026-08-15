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
vi.mock("../../src/db/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) },
}));

const { buildApp } = await import("../../src/app.js");
const { createPayment, processPaymentWebhook } = await import("../../src/services/payment.service.js");

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
