import type { Business } from "@spa/db";
import { BusinessSuspendedError, NotFoundError } from "../errors/index.js";

type BusinessGate = Pick<Business, "status" | "active">;

/**
 * Estados de suscripción en los que el negocio atiende con normalidad
 * (reservas, bot de WhatsApp, compra de gift cards) — docs/PANEL-OPERADOR.md §5.
 * `PAST_DUE` (factura vencida, aún en gracia) todavía opera; solo `SUSPENDED` y
 * `CANCELLED` cortan el servicio.
 */
const OPERATIONAL_STATUSES: ReadonlySet<Business["status"]> = new Set([
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
]);

/** True si el negocio puede recibir reservas, atender el bot y vender gift cards. */
export function isBusinessOperational(business: BusinessGate): boolean {
  return business.active && OPERATIONAL_STATUSES.has(business.status);
}

/**
 * Puerta única de las superficies HTTP: reservas web/API, compra de gift cards y
 * herramientas del agente (n8n). `SUSPENDED` → 403 con aviso; `CANCELLED` o el
 * flag legacy `active=false` → 404 (no confirma que el negocio existe).
 *
 * El canal de WhatsApp NO usa esto: aplica la "suspensión suave" por su cuenta
 * (un único mensaje) y silencio para `CANCELLED` — ver whatsapp-conversation.service.
 * Máquina de estados completa: docs/PANEL-OPERADOR.md §5.
 */
export function assertBusinessOperational(business: BusinessGate): void {
  if (isBusinessOperational(business)) {
    return;
  }
  if (business.status === "SUSPENDED") {
    throw new BusinessSuspendedError(
      "El servicio de este negocio está temporalmente inactivo. Comunícate directamente con el negocio.",
    );
  }
  throw new NotFoundError("Negocio no encontrado.");
}
