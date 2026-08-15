import type { FastifyInstance } from "fastify";
import { getAvailabilityHandler } from "../controllers/availability.controller.js";
import { createAppointmentHandler } from "../controllers/appointment.controller.js";

export async function appointmentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/appointments/availability", getAvailabilityHandler);
  app.post("/api/appointments", createAppointmentHandler);
}
