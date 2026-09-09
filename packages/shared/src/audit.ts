import { z } from "zod";

/**
 * Bitácora de acciones sensibles del panel (docs/PANEL-OPERADOR.md §9). Se
 * escribe desde los servicios `/admin/*` y desde los jobs (actor `system`);
 * aquí solo se define cómo se lee.
 */

export interface AuditLogRow {
  id: string;
  actor: string;
  action: string;
  businessId: string | null;
  businessName: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

/** Filtros de `GET /admin/audit-logs` (además de la paginación estándar). */
export const auditQuerySchema = z.object({
  businessId: z.string().uuid().optional(),
  /** Prefijo de acción: `business.` trae create/update/activate/status… */
  action: z.string().trim().max(60).optional(),
  actor: z.string().trim().max(80).optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

/**
 * Etiquetas legibles de las acciones que registra el backend. Lo que no esté
 * aquí se muestra tal cual (no vale la pena romper el panel por una acción nueva).
 */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "business.create": "Negocio creado",
  "business.update": "Negocio actualizado",
  "business.branding.update": "Marca actualizada",
  "business.onboarding.update": "Checklist actualizado",
  "business.activate": "Negocio activado",
  "business.status.change": "Cambio de estado",
  "business.subscription.upsert": "Plan guardado",
  "business.subscription.extend": "Vigencia extendida",
  "business.contact.create": "Contacto creado",
  "business.contact.update": "Contacto actualizado",
  "business.contact.delete": "Contacto eliminado",
  "billing.invoice.create": "Cuenta de cobro emitida",
  "billing.invoice.send": "Cuenta de cobro enviada",
  "billing.invoice.void": "Cuenta de cobro anulada",
  "billing.invoice.overdue": "Cuenta de cobro vencida",
  "billing.payment.register": "Pago registrado",
  "whatsapp.account.connect": "Número de WhatsApp conectado",
  "whatsapp.account.update": "Número de WhatsApp actualizado",
  "whatsapp.account.disconnect": "Número de WhatsApp desconectado",
  "payment.credentials.upsert": "Llaves de Wompi guardadas",
  "payment.credentials.delete": "Llaves de Wompi eliminadas",
};
