import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tx } = vi.hoisted(() => ({ tx: { marker: "tx" } }));

vi.mock("../../src/db/prisma.js", () => ({
  prisma: { $transaction: vi.fn(async (fn: (client: unknown) => unknown) => fn(tx)) },
}));
vi.mock("../../src/repositories/appointment.repository.js", () => ({
  appointmentRepository: { findForAction: vi.fn(), transitionFrom: vi.fn() },
}));
vi.mock("../../src/repositories/auditLog.repository.js", () => ({
  auditLogRepository: { record: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../src/services/google-sheets-sync.service.js", () => ({
  syncAppointmentToSheet: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/services/notification.service.js", () => ({
  notifyAppointmentCancelled: vi.fn().mockResolvedValue({ via: "direct", sent: true, phone: "+573001112233" }),
}));

const { appointmentRepository } = await import("../../src/repositories/appointment.repository.js");
const { auditLogRepository } = await import("../../src/repositories/auditLog.repository.js");
const { syncAppointmentToSheet } = await import("../../src/services/google-sheets-sync.service.js");
const { notifyAppointmentCancelled } = await import("../../src/services/notification.service.js");
const { applyAppointmentAction } = await import("../../src/services/appointment-actions.service.js");
const { ConflictError, NotFoundError, ValidationError } = await import("../../src/errors/index.js");
const { availableAppointmentActions } = await import("@spa/shared");

const BID = "11111111-1111-1111-1111-111111111111";
const AID = "22222222-2222-2222-2222-222222222222";

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: AID,
    businessId: BID,
    appointmentCode: "SPA-1234",
    // 2026-10-03 en UTC = fecha de calendario de la cita.
    appointmentDate: new Date("2026-10-03T00:00:00Z"),
    status: "CONFIRMED",
    paymentStatus: "PAID",
    depositAmount: null,
    pendingBalance: null,
    notes: null,
    business: { timezone: "America/Bogota" },
    ...overrides,
  } as never;
}

describe("applyAppointmentAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 3 oct 2026, 15:00 en Bogotá.
    vi.setSystemTime(new Date("2026-10-03T20:00:00Z"));
    vi.mocked(appointmentRepository.transitionFrom).mockResolvedValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("marca atendida, audita en la misma transacción y sincroniza la hoja", async () => {
    vi.mocked(appointmentRepository.findForAction).mockResolvedValue(appointment());

    const result = await applyAppointmentAction(BID, AID, { action: "complete", balancePaid: true }, "rec@spa.co");

    expect(result).toEqual({ id: AID, status: "COMPLETED", paymentStatus: "PAID", pendingBalance: null });
    expect(appointmentRepository.transitionFrom).toHaveBeenCalledWith(AID, "CONFIRMED", { status: "COMPLETED" }, tx);
    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ actor: "rec@spa.co", action: "appointment.complete", businessId: BID }),
      tx,
    );
    expect(syncAppointmentToSheet).toHaveBeenCalledWith(AID);
  });

  it("con abono, 'saldo cobrado' deja el pago en PAID y el saldo en 0", async () => {
    vi.mocked(appointmentRepository.findForAction).mockResolvedValue(
      appointment({ paymentStatus: "DEPOSIT_PAID", depositAmount: "30000", pendingBalance: "50000" }),
    );

    const result = await applyAppointmentAction(BID, AID, { action: "complete", balancePaid: true }, "rec@spa.co");

    expect(result).toMatchObject({ paymentStatus: "PAID", pendingBalance: 0 });
    expect(appointmentRepository.transitionFrom).toHaveBeenCalledWith(
      AID,
      "CONFIRMED",
      { status: "COMPLETED", paymentStatus: "PAID", pendingBalance: 0 },
      tx,
    );
  });

  it("con abono y sin cobrar el saldo, el saldo queda pendiente", async () => {
    vi.mocked(appointmentRepository.findForAction).mockResolvedValue(
      appointment({ paymentStatus: "DEPOSIT_PAID", depositAmount: "30000", pendingBalance: "50000" }),
    );

    const result = await applyAppointmentAction(BID, AID, { action: "complete", balancePaid: false }, "rec@spa.co");

    expect(result).toMatchObject({ status: "COMPLETED", paymentStatus: "DEPOSIT_PAID", pendingBalance: 50000 });
  });

  it("no deja marcar atendida ni no-asistió una cita futura", async () => {
    vi.mocked(appointmentRepository.findForAction).mockResolvedValue(
      appointment({ appointmentDate: new Date("2026-10-04T00:00:00Z") }),
    );

    await expect(applyAppointmentAction(BID, AID, { action: "no_show" }, "x")).rejects.toBeInstanceOf(ValidationError);
    expect(appointmentRepository.transitionFrom).not.toHaveBeenCalled();
  });

  it("cancelar guarda el motivo en las notas y en el audit log", async () => {
    vi.mocked(appointmentRepository.findForAction).mockResolvedValue(
      appointment({ status: "PENDING", notes: "Alergia a la lavanda" }),
    );

    await applyAppointmentAction(
      BID,
      AID,
      { action: "cancel", reason: "La clienta llamó", notifyCustomer: false },
      "rec@spa.co",
    );

    expect(appointmentRepository.transitionFrom).toHaveBeenCalledWith(
      AID,
      "PENDING",
      { status: "CANCELLED", notes: "Alergia a la lavanda\nCancelada desde el panel: La clienta llamó" },
      tx,
    );
    expect(auditLogRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ reason: "La clienta llamó" }) }),
      tx,
    );
  });

  it("cancelar con aviso le escribe a la clienta y devuelve si salió", async () => {
    vi.mocked(appointmentRepository.findForAction).mockResolvedValue(appointment());
    vi.mocked(notifyAppointmentCancelled).mockResolvedValueOnce({ via: "direct", sent: false, phone: "+573001112233" });

    const result = await applyAppointmentAction(
      BID,
      AID,
      { action: "cancel", reason: "Se enfermó la terapeuta", notifyCustomer: true },
      "rec@spa.co",
    );

    expect(notifyAppointmentCancelled).toHaveBeenCalledWith(AID);
    expect(result.customerNotice).toEqual({ via: "direct", sent: false, phone: "+573001112233" });
  });

  it("cancelar sin aviso no le escribe a la clienta", async () => {
    vi.mocked(appointmentRepository.findForAction).mockResolvedValue(appointment());

    const result = await applyAppointmentAction(
      BID,
      AID,
      { action: "cancel", reason: "Ella pidió cancelar", notifyCustomer: false },
      "rec@spa.co",
    );

    expect(notifyAppointmentCancelled).not.toHaveBeenCalled();
    expect(result.customerNotice).toBeUndefined();
  });

  it("si la cancelación choca con otra escritura, no se avisa a nadie", async () => {
    vi.mocked(appointmentRepository.findForAction).mockResolvedValue(appointment());
    vi.mocked(appointmentRepository.transitionFrom).mockResolvedValue(false);

    await expect(
      applyAppointmentAction(BID, AID, { action: "cancel", reason: "Motivo", notifyCustomer: true }, "rec@spa.co"),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(notifyAppointmentCancelled).not.toHaveBeenCalled();
  });

  it("rechaza una acción que no aplica al estado actual", async () => {
    vi.mocked(appointmentRepository.findForAction).mockResolvedValue(appointment({ status: "CANCELLED" }));
    await expect(applyAppointmentAction(BID, AID, { action: "reopen" }, "x")).rejects.toBeInstanceOf(ValidationError);
  });

  it("una cita de otro negocio es 404", async () => {
    vi.mocked(appointmentRepository.findForAction).mockResolvedValue(appointment({ businessId: "otro" }));
    await expect(applyAppointmentAction(BID, AID, { action: "no_show" }, "x")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("si otra escritura llegó primero responde conflicto", async () => {
    vi.mocked(appointmentRepository.findForAction).mockResolvedValue(appointment());
    vi.mocked(appointmentRepository.transitionFrom).mockResolvedValue(false);

    await expect(applyAppointmentAction(BID, AID, { action: "no_show" }, "x")).rejects.toBeInstanceOf(ConflictError);
    expect(auditLogRepository.record).not.toHaveBeenCalled();
  });

  it("reabrir sobre un cupo ya ocupado se traduce a conflicto", async () => {
    vi.mocked(appointmentRepository.findForAction).mockResolvedValue(appointment({ status: "NO_SHOW" }));
    vi.mocked(appointmentRepository.transitionFrom).mockRejectedValue(
      new Error("appointment_capacity_exceeded: business_id=..."),
    );

    await expect(applyAppointmentAction(BID, AID, { action: "reopen" }, "x")).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("availableAppointmentActions", () => {
  it("ofrece atender/no asistió solo desde el día de la cita", () => {
    expect(availableAppointmentActions("CONFIRMED", "2026-10-03", "2026-10-03")).toEqual([
      "complete",
      "no_show",
      "cancel",
    ]);
    expect(availableAppointmentActions("CONFIRMED", "2026-10-04", "2026-10-03")).toEqual(["cancel"]);
    expect(availableAppointmentActions("NO_SHOW", "2026-10-01", "2026-10-03")).toEqual(["reopen"]);
    expect(availableAppointmentActions("EXPIRED", "2026-10-01", "2026-10-03")).toEqual([]);
  });
});
