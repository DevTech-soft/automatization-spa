import { DateTime } from "luxon";
import type { Appointment, AppointmentSource, Customer, Service } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { businessRepository } from "../repositories/business.repository.js";
import { serviceRepository } from "../repositories/service.repository.js";
import { businessHourRepository } from "../repositories/businessHour.repository.js";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { customerRepository } from "../repositories/customer.repository.js";
import { AvailabilityError, NotFoundError, ValidationError } from "../errors/index.js";
import {
  businessDateTimeToInstant,
  businessToday,
  calendarDayOfWeek,
  currentMinutesInBusinessDay,
  dateOnlyFromUTCDate,
  dateOnlyToUTCDate,
  daysBetween,
  isValidCalendarDate,
  minutesToTime,
  parseTimeToMinutes,
} from "../utils/datetime.js";
import { normalizePhone } from "../utils/phone.js";
import { generateCode } from "../utils/code-generator.js";
import { isUniqueConstraintViolation } from "../utils/prisma-errors.js";
import { syncAppointmentToSheet, syncCustomerToSheet } from "./google-sheets-sync.service.js";
import { notifyAppointmentReminder } from "./notification.service.js";
import {
  MAX_BOOKING_DAYS_AHEAD,
  PENDING_EXPIRATION_MINUTES,
  REMINDER_HOURS_BEFORE,
  REMINDER_WINDOW_MINUTES,
} from "../config/constants.js";

export interface CreateAppointmentInput {
  businessId: string;
  serviceId: string;
  date: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | undefined;
  notes?: string | undefined;
  source: AppointmentSource;
}

export type AppointmentWithRelations = Appointment & { customer: Customer; service: Service };

const MAX_CODE_ATTEMPTS = 5;
const NO_AVAILABILITY_MESSAGE = "Lo sentimos, no tenemos disponibilidad para ese horario.";

/**
 * Crea una reserva PENDING. Reutilizable por el formulario web (Fase 5) y por
 * WhatsApp (Fase 6) pasando `source` distinto — no duplicar esta lógica.
 *
 * Control de concurrencia (sección 12): toma un `pg_advisory_xact_lock`
 * scopeado a (business_id, service_id, date) y recuenta el solape dentro de
 * la misma transacción, para que dos requests simultáneas al mismo slot no
 * puedan pasar ambas el chequeo de disponibilidad. Un trigger de Postgres
 * (ver prisma/migrations) actúa como red de seguridad adicional a nivel de
 * base de datos.
 */
export async function createAppointment(input: CreateAppointmentInput): Promise<AppointmentWithRelations> {
  const { businessId, serviceId, date, startTime, source } = input;

  if (!isValidCalendarDate(date)) {
    throw new ValidationError("Fecha inválida.");
  }

  const business = await businessRepository.findById(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  const service = await serviceRepository.findActiveById(businessId, serviceId);
  if (!service) {
    throw new NotFoundError("Servicio no encontrado.");
  }

  const today = businessToday(business.timezone);
  if (date < today) {
    throw new ValidationError("No se pueden crear reservas en fechas pasadas.");
  }
  if (daysBetween(today, date) > MAX_BOOKING_DAYS_AHEAD) {
    throw new ValidationError(`Solo se puede reservar hasta ${MAX_BOOKING_DAYS_AHEAD} días de anticipación.`);
  }

  const hours = await businessHourRepository.findForDay(businessId, calendarDayOfWeek(date));
  if (!hours) {
    throw new AvailabilityError(NO_AVAILABILITY_MESSAGE);
  }

  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = startMinutes + service.durationMinutes;
  const openMinutes = parseTimeToMinutes(hours.openTime);
  const closeMinutes = parseTimeToMinutes(hours.closeTime);

  if (startMinutes < openMinutes || endMinutes > closeMinutes) {
    throw new AvailabilityError(NO_AVAILABILITY_MESSAGE);
  }
  if (date === today && startMinutes <= currentMinutesInBusinessDay(business.timezone)) {
    throw new AvailabilityError(NO_AVAILABILITY_MESSAGE);
  }

  const endTime = minutesToTime(endMinutes);
  const phone = normalizePhone(input.customerPhone);
  const lockKey = `${businessId}:${serviceId}:${date}`;
  const expiresAt = DateTime.now().plus({ minutes: PENDING_EXPIRATION_MINUTES }).toJSDate();
  const appointmentDate = dateOnlyToUTCDate(date);

  const appointment = await prisma.$transaction(async (tx) => {
    // Serializa los intentos de reserva de este servicio/día: evita que dos
    // requests concurrentes pasen el chequeo de disponibilidad a la vez.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;

    const blocking = await appointmentRepository.findBlocking(businessId, serviceId, date, tx);
    const overlapCount = blocking.filter(
      (appointment) =>
        parseTimeToMinutes(appointment.startTime) < endMinutes &&
        parseTimeToMinutes(appointment.endTime) > startMinutes,
    ).length;

    if (overlapCount >= service.capacity) {
      throw new AvailabilityError(NO_AVAILABILITY_MESSAGE);
    }

    const customer = await customerRepository.upsertByPhone(
      businessId,
      phone,
      { name: input.customerName, email: input.customerEmail },
      tx,
    );

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      try {
        return await appointmentRepository.create(
          {
            businessId,
            customerId: customer.id,
            serviceId,
            appointmentCode: generateCode("APT"),
            appointmentDate,
            startTime,
            endTime,
            price: service.price,
            status: "PENDING",
            paymentStatus: "PENDING",
            source,
            notes: input.notes,
            expiresAt,
          },
          tx,
        );
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new Error("No se pudo generar un código de cita único tras varios intentos.");
  });

  // Fuera de la transacción a propósito, sin esperar: un fallo o una demora de
  // Google Sheets nunca debe afectar la respuesta al cliente (sección 2/19).
  void syncAppointmentToSheet(appointment.id);
  void syncCustomerToSheet(appointment.customerId);

  return appointment;
}

/** Marca como EXPIRED las reservas PENDING vencidas (sección 10). Llamado por el scheduler (Fase 9). */
export async function expireStalePendingAppointments(): Promise<number> {
  return appointmentRepository.expireStalePending(new Date());
}

/**
 * Envía el recordatorio de las citas CONFIRMED que están a ~24h de su
 * inicio (sección 21). Llamado por el scheduler (src/jobs/scheduler.ts, cada
 * hora) — trae candidatas en un rango amplio de `appointment_date` (para no
 * perder ninguna por el timezone del negocio) y filtra por instante real
 * antes de notificar. La idempotencia real vive en `notifyAppointmentReminder`
 * (notification_log), así que solapar la ventana entre corridas es seguro.
 */
export async function sendUpcomingAppointmentReminders(): Promise<number> {
  const now = DateTime.utc();
  const fromDate = now.startOf("day").toJSDate();
  const toDate = now.plus({ days: 2 }).endOf("day").toJSDate();
  const candidates = await appointmentRepository.findConfirmedForReminders(fromDate, toDate);

  const windowStart = now.plus({ hours: REMINDER_HOURS_BEFORE, minutes: -REMINDER_WINDOW_MINUTES }).toMillis();
  const windowEnd = now.plus({ hours: REMINDER_HOURS_BEFORE }).toMillis();

  let sent = 0;
  for (const appointment of candidates) {
    const instant = businessDateTimeToInstant(
      dateOnlyFromUTCDate(appointment.appointmentDate),
      appointment.startTime,
      appointment.business.timezone,
    ).toMillis();
    if (instant >= windowStart && instant < windowEnd) {
      await notifyAppointmentReminder(appointment.id);
      sent++;
    }
  }

  return sent;
}

export interface AppointmentStatusResult {
  appointmentCode: string;
  status: string;
  paymentStatus: string;
  serviceName: string;
  date: string;
  startTime: string;
  endTime: string;
  price: string;
}

/**
 * Usado por `/gracias` (Fase 5) tras volver del checkout del proveedor de
 * pago. La referencia no requiere login (sección 13) — es el mismo código
 * corto no adivinable que ya usa `payment.reference`.
 */
export async function getAppointmentStatusByReference(reference: string): Promise<AppointmentStatusResult> {
  const appointment = await appointmentRepository.findByPaymentReference(reference);
  if (!appointment) {
    throw new NotFoundError("No se encontró una reserva con esa referencia de pago.");
  }

  return {
    appointmentCode: appointment.appointmentCode,
    status: appointment.status,
    paymentStatus: appointment.paymentStatus,
    serviceName: appointment.service.name,
    date: dateOnlyFromUTCDate(appointment.appointmentDate),
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    price: appointment.price.toString(),
  };
}
