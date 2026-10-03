import { z } from "zod";

/**
 * Acciones de la recepción sobre una cita (docs/PANEL-OPERADOR.md F7):
 * `POST /portal/appointments/:id/actions` (y la misma ruta bajo
 * `/admin/businesses/:id/...` para el operador).
 *
 * | Acción     | Desde                 | Hacia       | Cuándo                         |
 * |------------|-----------------------|-------------|--------------------------------|
 * | `complete` | CONFIRMED             | COMPLETED   | el día de la cita o después    |
 * | `no_show`  | CONFIRMED             | NO_SHOW     | el día de la cita o después    |
 * | `cancel`   | PENDING, CONFIRMED    | CANCELLED   | cuando sea; exige motivo       |
 * | `reopen`   | COMPLETED, NO_SHOW    | CONFIRMED   | para deshacer un error         |
 */

export const appointmentActionValues = ["complete", "no_show", "cancel", "reopen"] as const;
export type AppointmentAction = (typeof appointmentActionValues)[number];

export const appointmentActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("complete"),
    /**
     * Con abono: se cobró el saldo en el local → pago `PAID`, saldo en 0. Sin
     * abono no aplica.
     */
    balancePaid: z.boolean().default(true),
  }),
  z.object({ action: z.literal("no_show") }),
  z.object({
    action: z.literal("cancel"),
    reason: z.string().trim().min(3, "Cuéntanos el motivo (mínimo 3 caracteres).").max(300),
    /**
     * Mandarle a la clienta un WhatsApp diciendo que su cita se canceló. El
     * motivo NO va en el mensaje: es una nota interna. Se apaga cuando fue ella
     * misma quien pidió cancelar.
     */
    notifyCustomer: z.boolean().default(true),
  }),
  z.object({ action: z.literal("reopen") }),
]);

export type AppointmentActionInput = z.infer<typeof appointmentActionSchema>;

/** Estado resultante, para que el panel actualice la fila sin recargar todo. */
export interface AppointmentActionResult {
  id: string;
  status: string;
  paymentStatus: string;
  pendingBalance: number | null;
  /**
   * Solo al cancelar con aviso.
   * - `via: "agent"`: se le encargó al bot de n8n, que lo redacta y lo envía;
   *   `sent` solo dice que n8n recibió el encargo.
   * - `via: "direct"`: lo envió el backend. `sent: false` casi siempre es la
   *   ventana de 24 h de WhatsApp; el panel muestra el teléfono para avisar a mano.
   */
  customerNotice?: { via: "agent" | "direct"; sent: boolean; phone: string };
}

/**
 * Qué acciones ofrecer para una cita. Es solo para pintar botones: el backend
 * revalida estado y fecha.
 */
export function availableAppointmentActions(
  status: string,
  date: string,
  today: string,
): AppointmentAction[] {
  const started = date <= today;
  switch (status) {
    case "CONFIRMED":
      return started ? ["complete", "no_show", "cancel"] : ["cancel"];
    case "PENDING":
      return ["cancel"];
    case "COMPLETED":
    case "NO_SHOW":
      return ["reopen"];
    default:
      return [];
  }
}
