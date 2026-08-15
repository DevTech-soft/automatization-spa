import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/appointment.repository.js", () => ({
  appointmentRepository: { findByIdWithDetails: vi.fn() },
}));
vi.mock("../../src/repositories/customer.repository.js", () => ({
  customerRepository: { findById: vi.fn(), getAppointmentStats: vi.fn() },
}));
vi.mock("../../src/integrations/google-sheets/index.js", () => ({
  getGoogleSheetsProvider: vi.fn(),
}));

const { appointmentRepository } = await import("../../src/repositories/appointment.repository.js");
const { customerRepository } = await import("../../src/repositories/customer.repository.js");
const { getGoogleSheetsProvider } = await import("../../src/integrations/google-sheets/index.js");
const { syncAppointmentToSheet, syncCustomerToSheet } = await import(
  "../../src/services/google-sheets-sync.service.js"
);

const APPOINTMENT_ID = "44444444-4444-4444-4444-444444444444";
const CUSTOMER_ID = "33333333-3333-3333-3333-333333333333";

function fakeProvider() {
  return { name: "google-sheets", ensureSheet: vi.fn().mockResolvedValue(undefined), upsertRow: vi.fn().mockResolvedValue(undefined) };
}

describe("syncAppointmentToSheet", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("arma la fila de RESERVAS con las columnas en el orden de la sección 19", async () => {
    const provider = fakeProvider();
    vi.mocked(getGoogleSheetsProvider).mockReturnValue(provider as never);
    vi.mocked(appointmentRepository.findByIdWithDetails).mockResolvedValue({
      id: APPOINTMENT_ID,
      appointmentCode: "APT-ABC12345",
      appointmentDate: new Date("2026-01-05T00:00:00.000Z"),
      startTime: "10:00",
      endTime: "11:00",
      price: { toString: () => "90000" },
      status: "CONFIRMED",
      paymentStatus: "PAID",
      source: "WEB",
      createdAt: new Date("2026-01-04T12:00:00.000Z"),
      customer: { name: "Cliente de Prueba", phone: "+573001112233" },
      service: { name: "Masaje relajante" },
    } as never);

    await syncAppointmentToSheet(APPOINTMENT_ID);

    expect(provider.ensureSheet).toHaveBeenCalledWith("RESERVAS", expect.arrayContaining(["ID", "Código"]));
    expect(provider.upsertRow).toHaveBeenCalledWith("RESERVAS", APPOINTMENT_ID, [
      APPOINTMENT_ID,
      "APT-ABC12345",
      "Cliente de Prueba",
      "+573001112233",
      "Masaje relajante",
      "2026-01-05",
      "10:00",
      "90000",
      "CONFIRMED",
      "PAID",
      "WEB",
      "2026-01-04T12:00:00.000Z",
    ]);
  });

  it("no lanza si la reserva no existe", async () => {
    vi.mocked(appointmentRepository.findByIdWithDetails).mockResolvedValue(null);

    await expect(syncAppointmentToSheet(APPOINTMENT_ID)).resolves.toBeUndefined();
  });

  it("no propaga el error si falla la sincronización", async () => {
    vi.mocked(appointmentRepository.findByIdWithDetails).mockResolvedValue({
      id: APPOINTMENT_ID,
      customer: {},
      service: {},
      price: { toString: () => "0" },
      appointmentDate: new Date(),
      createdAt: new Date(),
    } as never);
    vi.mocked(getGoogleSheetsProvider).mockImplementation(() => {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL no configurado");
    });

    await expect(syncAppointmentToSheet(APPOINTMENT_ID)).resolves.toBeUndefined();
  });
});

describe("syncCustomerToSheet", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("arma la fila de CLIENTES con las estadísticas de reservas", async () => {
    const provider = fakeProvider();
    vi.mocked(getGoogleSheetsProvider).mockReturnValue(provider as never);
    vi.mocked(customerRepository.findById).mockResolvedValue({
      id: CUSTOMER_ID,
      name: "Cliente de Prueba",
      phone: "+573001112233",
      email: "cliente@example.com",
    } as never);
    vi.mocked(customerRepository.getAppointmentStats).mockResolvedValue({
      totalAppointments: 3,
      lastAppointmentDate: new Date("2026-01-05T00:00:00.000Z"),
    });

    await syncCustomerToSheet(CUSTOMER_ID);

    expect(provider.upsertRow).toHaveBeenCalledWith("CLIENTES", CUSTOMER_ID, [
      CUSTOMER_ID,
      "Cliente de Prueba",
      "+573001112233",
      "cliente@example.com",
      "2026-01-05",
      "3",
    ]);
  });

  it("usa cadenas vacías cuando no hay email o reservas previas", async () => {
    const provider = fakeProvider();
    vi.mocked(getGoogleSheetsProvider).mockReturnValue(provider as never);
    vi.mocked(customerRepository.findById).mockResolvedValue({
      id: CUSTOMER_ID,
      name: "Cliente Nuevo",
      phone: "+573001112233",
      email: null,
    } as never);
    vi.mocked(customerRepository.getAppointmentStats).mockResolvedValue({
      totalAppointments: 0,
      lastAppointmentDate: null,
    });

    await syncCustomerToSheet(CUSTOMER_ID);

    expect(provider.upsertRow).toHaveBeenCalledWith("CLIENTES", CUSTOMER_ID, [
      CUSTOMER_ID,
      "Cliente Nuevo",
      "+573001112233",
      "",
      "",
      "0",
    ]);
  });

  it("no lanza si el cliente no existe", async () => {
    vi.mocked(customerRepository.findById).mockResolvedValue(null);

    await expect(syncCustomerToSheet(CUSTOMER_ID)).resolves.toBeUndefined();
  });
});
