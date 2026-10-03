import type { AppointmentActionInput, AppointmentActionResult } from "@spa/shared";
import type { AppointmentStatus, PaymentStatus, Prisma } from "@spa/db";
import { prisma } from "../db/prisma.js";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors/index.js";
import { businessToday, dateOnlyFromUTCDate } from "../utils/datetime.js";
import { logger } from "../utils/logger.js";
import { syncAppointmentToSheet } from "./google-sheets-sync.service.js";

/**
 * Acciones de la recepción sobre una cita (docs/PANEL-OPERADOR.md F7): marcar
 * atendida, no asistió, cancelar y deshacer. La tabla de transiciones vive en
 * `@spa/shared/appointment-actions.ts`; aquí se revalida todo —el panel solo
 * decide qué botones pintar—.
 *
 * No toca dinero fuera de la app: cancelar una cita pagada no reembolsa en
 * Wompi (eso lo hace el negocio desde su comercio), y "saldo cobrado" solo
 * registra lo que se cobró en el local.
 */

const FROM: Record<AppointmentActionInput["action"], AppointmentStatus[]> = {
  complete: ["CONFIRMED"],
  no_show: ["CONFIRMED"],
  cancel: ["PENDING", "CONFIRMED"],
  reopen: ["COMPLETED", "NO_SHOW"],
};

const TO: Record<AppointmentActionInput["action"], AppointmentStatus> = {
  complete: "COMPLETED",
  no_show: "NO_SHOW",
  cancel: "CANCELLED",
  reopen: "CONFIRMED",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "pendiente de pago",
  CONFIRMED: "confirmada",
  COMPLETED: "atendida",
  CANCELLED: "cancelada",
  NO_SHOW: "marcada como no asistió",
  EXPIRED: "expirada",
};

function toNumber(value: Prisma.Decimal | null): number | null {
  return value == null ? null : Number(value);
}

export async function applyAppointmentAction(
  businessId: string,
  appointmentId: string,
  input: AppointmentActionInput,
  actor: string,
): Promise<AppointmentActionResult> {
  const appointment = await appointmentRepository.findForAction(appointmentId);
  // Una cita de otro negocio se trata como inexistente: no se revela que existe.
  if (!appointment || appointment.businessId !== businessId) {
    throw new NotFoundError("Cita no encontrada.");
  }

  if (!FROM[input.action].includes(appointment.status)) {
    throw new ValidationError(
      `La cita está ${STATUS_LABEL[appointment.status] ?? appointment.status}; esa acción no aplica.`,
    );
  }

  const date = dateOnlyFromUTCDate(appointment.appointmentDate);
  if ((input.action === "complete" || input.action === "no_show") && date > businessToday(appointment.business.timezone)) {
    throw new ValidationError("Solo se puede marcar el día de la cita o después.");
  }

  const data: Prisma.AppointmentUpdateManyMutationInput = { status: TO[input.action] };
  let paymentStatus: PaymentStatus = appointment.paymentStatus;
  let pendingBalance = toNumber(appointment.pendingBalance);

  if (
    input.action === "complete" &&
    input.balancePaid &&
    appointment.paymentStatus === "DEPOSIT_PAID" &&
    (pendingBalance ?? 0) > 0
  ) {
    // `depositAmount` se conserva: sigue diciendo cuánto se pagó online.
    paymentStatus = "PAID";
    pendingBalance = 0;
    data.paymentStatus = paymentStatus;
    data.pendingBalance = 0;
  }

  if (input.action === "cancel") {
    const note = `Cancelada desde el panel: ${input.reason}`;
    data.notes = appointment.notes ? `${appointment.notes}\n${note}` : note;
  }

  try {
    await prisma.$transaction(async (tx) => {
      // `updateMany` con el estado esperado: si otra persona (o el job de
      // expiración) la cambió entre la lectura y aquí, no se pisa.
      const changed = await appointmentRepository.transitionFrom(appointmentId, appointment.status, data, tx);
      if (!changed) {
        throw new ConflictError("La cita cambió mientras la editabas. Recarga e intenta de nuevo.");
      }

      await auditLogRepository.record(
        {
          actor,
          action: `appointment.${input.action}`,
          businessId,
          before: {
            status: appointment.status,
            paymentStatus: appointment.paymentStatus,
            pendingBalance: toNumber(appointment.pendingBalance),
          },
          after: { status: TO[input.action], paymentStatus, pendingBalance },
          metadata: {
            appointmentId,
            code: appointment.appointmentCode,
            ...(input.action === "cancel" ? { reason: input.reason } : {}),
          },
        },
        tx,
      );
    });
  } catch (error) {
    // Reabrir una cita vuelve a ocupar el cupo; si ya lo tomó otra, el trigger
    // de capacidad (migración `appointment_capacity_trigger`) la rechaza.
    if (error instanceof Error && error.message.includes("appointment_capacity_exceeded")) {
      throw new ConflictError("Ese horario ya está ocupado por otra cita; no se puede reabrir.");
    }
    throw error;
  }

  logger.info({ actor, businessId, appointmentId, action: input.action }, "appointment_action_applied");
  void syncAppointmentToSheet(appointmentId);

  return { id: appointmentId, status: TO[input.action], paymentStatus, pendingBalance };
}
