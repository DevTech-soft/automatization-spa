import type { BusinessDetail, ChangeStatusInput } from "@spa/shared";
import { ALLOWED_STATUS_TRANSITIONS, BUSINESS_STATUS_LABEL } from "@spa/shared";
import type { Prisma } from "@spa/db";
import { adminBusinessRepository } from "../repositories/adminBusiness.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import { NotFoundError, ValidationError } from "../errors/index.js";
import { logger } from "../utils/logger.js";
import { getBusiness } from "./admin-business.service.js";

/**
 * Transiciones explícitas de la máquina de estados del negocio
 * (docs/PANEL-OPERADOR.md §5). Endpoint propio y no el PATCH genérico a
 * propósito: suspender o cancelar corta el servicio a un cliente real —bot,
 * reservas web y gift cards dejan de responder vía `business-guard`—, así que
 * exige motivo y siempre deja rastro en `AuditLog`.
 *
 * `TRIAL → ACTIVE` no pasa por aquí: activar exige el checklist de onboarding
 * completo (`admin-onboarding.service`), que este endpoint no revalida.
 */
export async function changeBusinessStatus(
  businessId: string,
  input: ChangeStatusInput,
  actor: string,
): Promise<BusinessDetail> {
  const before = await adminBusinessRepository.findDetail(businessId);
  if (!before) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  if (before.status === input.status) {
    throw new ValidationError(`El negocio ya está en estado "${BUSINESS_STATUS_LABEL[input.status]}".`);
  }

  const allowed = ALLOWED_STATUS_TRANSITIONS[before.status];
  if (!allowed.includes(input.status)) {
    throw new ValidationError(
      `No se puede pasar de "${BUSINESS_STATUS_LABEL[before.status]}" a "${
        BUSINESS_STATUS_LABEL[input.status]
      }".`,
    );
  }
  if (before.status === "TRIAL" && input.status === "ACTIVE") {
    throw new ValidationError(
      "Para salir de la prueba usa la activación del onboarding: verifica el checklist completo.",
    );
  }

  await adminBusinessRepository.updateStatus(businessId, input.status);

  await auditLogRepository.record({
    actor,
    action: "business.status.change",
    businessId,
    before: { status: before.status } as Prisma.InputJsonValue,
    after: { status: input.status, reason: input.reason } as Prisma.InputJsonValue,
  });
  logger.warn(
    { actor, businessId, from: before.status, to: input.status, reason: input.reason },
    "admin_business_status_changed",
  );

  return getBusiness(businessId);
}
