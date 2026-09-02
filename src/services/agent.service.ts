import { businessRepository } from "../repositories/business.repository.js";
import { getWhatsAppProvider } from "../integrations/whatsapp/index.js";
import { serviceRepository } from "../repositories/service.repository.js";
import { appointmentRepository } from "../repositories/appointment.repository.js";
import { getAvailability } from "./availability.service.js";
import { createAppointment } from "./appointment.service.js";
import { createPayment } from "./payment.service.js";
import { AvailabilityError, NotFoundError, ValidationError } from "../errors/index.js";
import { businessToday, dateOnlyFromUTCDate, dateOnlyToUTCDate } from "../utils/datetime.js";
import { normalizePhone } from "../utils/phone.js";
import { logger } from "../utils/logger.js";
import { PENDING_EXPIRATION_MINUTES } from "../config/constants.js";

/**
 * Capa que expone la lógica de reservas como herramientas del agente
 * conversacional de n8n (ver docs/AGENTE-N8N.md).
 *
 * No reimplementa reglas de negocio: llama a los mismos servicios que usan el
 * formulario web y el bot de menús, para que la disponibilidad, el bloqueo de
 * concurrencia y el hold de pago sigan viviendo en un solo lugar. Lo que sí
 * hace es aplanar las respuestas — un modelo de lenguaje trabaja mucho mejor
 * con `{ hora: "10:00" }` que con un slot anidado de tres niveles.
 */

async function requireBusiness(businessId: string) {
  const business = await businessRepository.findById(businessId);
  if (!business) {
    throw new NotFoundError("Negocio no encontrado.");
  }
  return business;
}

export interface AgentServiceItem {
  servicioId: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  duracionMinutos: number;
}

export async function listAgentServices(businessId: string): Promise<AgentServiceItem[]> {
  await requireBusiness(businessId);
  const services = await serviceRepository.findActiveByBusinessId(businessId);

  return services.map((service) => ({
    servicioId: service.id,
    nombre: service.name,
    descripcion: service.description,
    precio: Number(service.price),
    duracionMinutos: service.durationMinutes,
  }));
}

export interface AgentAvailabilityResult {
  fecha: string;
  hayCupo: boolean;
  horasLibres: string[];
}

/**
 * Solo las horas libres, como lista de strings. El endpoint público devuelve
 * todos los slots con `available: true|false` porque el formulario web los
 * pinta deshabilitados; al agente esos slots ocupados solo le gastan contexto
 * y lo tientan a ofrecerlos.
 */
export async function getAgentAvailability(
  businessId: string,
  serviceId: string,
  date: string,
): Promise<AgentAvailabilityResult> {
  const result = await getAvailability({ businessId, serviceId, date });
  const horasLibres = result.slots.filter((slot) => slot.available).map((slot) => slot.startTime);

  return { fecha: date, hayCupo: horasLibres.length > 0, horasLibres };
}

export interface CreateAgentAppointmentInput {
  businessId: string;
  serviceId: string;
  date: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
  notes?: string | undefined;
}

export type CreateAgentAppointmentResult =
  | {
      creada: true;
      codigo: string;
      servicio: string;
      fecha: string;
      inicio: string;
      fin: string;
      precio: number;
      linkPago: string;
      minutosParaPagar: number;
    }
  | { creada: false; motivo: string };

/**
 * Crea la reserva y su link de pago en una sola herramienta. Son dos pasos
 * (`createAppointment` + `createPayment`) que el agente no debería poder dejar
 * a medias: una cita creada sin link de pago expira sola en
 * PENDING_EXPIRATION_MINUTES y la clienta nunca se entera.
 *
 * Los rechazos esperables (slot ocupado, fecha pasada, fuera de horario) se
 * devuelven como `creada: false` con un motivo en español en vez de un error
 * HTTP, para que el agente lo lea y ofrezca otra hora en la misma respuesta en
 * lugar de disculparse por una falla técnica.
 */
export async function createAgentAppointment(
  input: CreateAgentAppointmentInput,
): Promise<CreateAgentAppointmentResult> {
  await requireBusiness(input.businessId);

  try {
    const appointment = await createAppointment({
      businessId: input.businessId,
      serviceId: input.serviceId,
      date: input.date,
      startTime: input.startTime,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      notes: input.notes,
      source: "WHATSAPP",
    });

    const payment = await createPayment({ entityType: "APPOINTMENT", entityId: appointment.id });

    return {
      creada: true,
      codigo: appointment.appointmentCode,
      servicio: appointment.service.name,
      fecha: dateOnlyFromUTCDate(appointment.appointmentDate),
      inicio: appointment.startTime,
      fin: appointment.endTime,
      precio: Number(appointment.price),
      linkPago: payment.paymentUrl,
      minutosParaPagar: PENDING_EXPIRATION_MINUTES,
    };
  } catch (error) {
    if (error instanceof AvailabilityError || error instanceof ValidationError) {
      return { creada: false, motivo: error.message };
    }
    logger.error({ error, businessId: input.businessId }, "agent_create_appointment_failed");
    throw error;
  }
}

export interface AgentAppointmentItem {
  codigo: string;
  servicio: string;
  fecha: string;
  inicio: string;
  fin: string;
  estado: string;
  estadoPago: string;
  precio: number;
}

export async function listAgentAppointments(
  businessId: string,
  phone: string,
): Promise<AgentAppointmentItem[]> {
  const business = await requireBusiness(businessId);
  const fromDate = dateOnlyToUTCDate(businessToday(business.timezone));
  const appointments = await appointmentRepository.findActiveByPhone(
    businessId,
    normalizePhone(phone),
    fromDate,
  );

  return appointments.map((appointment) => ({
    codigo: appointment.appointmentCode,
    servicio: appointment.service.name,
    fecha: dateOnlyFromUTCDate(appointment.appointmentDate),
    inicio: appointment.startTime,
    fin: appointment.endTime,
    estado: appointment.status,
    estadoPago: appointment.paymentStatus,
    precio: Number(appointment.price),
  }));
}

/**
 * Entrega al cliente el texto que redactó el agente.
 *
 * n8n no habla con Meta: la regla de `WhatsAppProvider.ts` es que ningún módulo
 * fuera de la capa de integración lo haga, y respetarla mantiene el token, los
 * reintentos y un eventual cambio de BSP en un solo sitio. n8n redacta, el
 * backend envía.
 */
export async function sendAgentReply(businessId: string, phone: string, text: string): Promise<void> {
  await requireBusiness(businessId);
  const provider = getWhatsAppProvider();
  await provider.sendText(normalizePhone(phone), text);
  logger.info({ businessId, phone }, "agent_reply_sent");
}
