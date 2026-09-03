import { businessRepository } from "../repositories/business.repository.js";
import { serviceRepository } from "../repositories/service.repository.js";
import { businessHourRepository } from "../repositories/businessHour.repository.js";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { NotFoundError, ValidationError } from "../errors/index.js";
import { assertBusinessOperational } from "./business-guard.js";
import {
  businessToday,
  calendarDayOfWeek,
  currentMinutesInBusinessDay,
  daysBetween,
  isValidCalendarDate,
  minutesToTime,
  parseTimeToMinutes,
} from "../utils/datetime.js";
import { AVAILABILITY_SLOT_GRANULARITY_MINUTES, MAX_BOOKING_DAYS_AHEAD } from "../config/constants.js";

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface AvailabilityResult {
  businessId: string;
  serviceId: string;
  date: string;
  timezone: string;
  slots: AvailabilitySlot[];
}

export interface GetAvailabilityParams {
  businessId: string;
  serviceId: string;
  date: string;
}

/**
 * Servicio centralizado de disponibilidad. Debe ser el único punto que decide
 * qué horarios están libres — reutilizable por el formulario web, WhatsApp y
 * futuras APIs (sección 11 del prompt maestro). No duplicar esta lógica.
 */
export async function getAvailability(params: GetAvailabilityParams): Promise<AvailabilityResult> {
  const { businessId, serviceId, date } = params;

  if (!isValidCalendarDate(date)) {
    throw new ValidationError("Fecha inválida.");
  }

  const business = await businessRepository.findById(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }
  assertBusinessOperational(business);

  const service = await serviceRepository.findActiveById(businessId, serviceId);
  if (!service) {
    throw new NotFoundError("Servicio no encontrado.");
  }

  const today = businessToday(business.timezone);
  if (date < today) {
    throw new ValidationError("No se pueden consultar fechas pasadas.");
  }
  if (daysBetween(today, date) > MAX_BOOKING_DAYS_AHEAD) {
    throw new ValidationError(
      `Solo se puede consultar disponibilidad hasta ${MAX_BOOKING_DAYS_AHEAD} días de anticipación.`,
    );
  }

  const hours = await businessHourRepository.findForDay(businessId, calendarDayOfWeek(date));
  if (!hours) {
    return { businessId, serviceId, date, timezone: business.timezone, slots: [] };
  }

  const openMinutes = parseTimeToMinutes(hours.openTime);
  const closeMinutes = parseTimeToMinutes(hours.closeTime);
  const duration = service.durationMinutes;

  const candidateStarts: number[] = [];
  for (let start = openMinutes; start + duration <= closeMinutes; start += AVAILABILITY_SLOT_GRANULARITY_MINUTES) {
    candidateStarts.push(start);
  }

  if (candidateStarts.length === 0) {
    return { businessId, serviceId, date, timezone: business.timezone, slots: [] };
  }

  const blocking = await appointmentRepository.findBlocking(businessId, serviceId, date);
  const blockingRanges = blocking.map((appointment) => ({
    start: parseTimeToMinutes(appointment.startTime),
    end: parseTimeToMinutes(appointment.endTime),
  }));

  const isToday = date === today;
  const nowMinutes = isToday ? currentMinutesInBusinessDay(business.timezone) : -1;

  const slots: AvailabilitySlot[] = candidateStarts.map((startMinutes) => {
    const endMinutes = startMinutes + duration;
    const startTime = minutesToTime(startMinutes);
    const endTime = minutesToTime(endMinutes);

    if (isToday && startMinutes <= nowMinutes) {
      return { startTime, endTime, available: false };
    }

    const overlapCount = blockingRanges.filter(
      (range) => range.start < endMinutes && range.end > startMinutes,
    ).length;

    return { startTime, endTime, available: overlapCount < service.capacity };
  });

  return { businessId, serviceId, date, timezone: business.timezone, slots };
}
