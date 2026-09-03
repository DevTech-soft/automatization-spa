import type { AgentSettings, BusinessBranding, UpdateBrandingInput } from "@spa/shared";
import type { Prisma } from "@spa/db";
import {
  adminBusinessRepository,
  type AdminBusinessBrandingRow,
} from "../repositories/adminBusiness.repository.js";
import { auditLogRepository } from "../repositories/auditLog.repository.js";
import { NotFoundError } from "../errors/index.js";
import { logger } from "../utils/logger.js";
import { mergeTextPatch, readAgent, readBusinessSettings } from "./business-settings.js";

/**
 * Marca por negocio (docs/PANEL-OPERADOR.md §6.1 paso 2): logo, colores y la
 * persona del agente. Se separa del CRUD de `admin-business.service` porque
 * escribe en dos sitios distintos —columnas y el JSON `settings`— y porque el
 * checklist de onboarding lo consulta como un paso propio.
 */

function toBranding(row: AdminBusinessBrandingRow): BusinessBranding {
  const settings = readBusinessSettings(row.settings);
  return {
    businessId: row.id,
    logoUrl: row.logoUrl,
    colorPrimary: row.colorPrimary,
    colorSecondary: row.colorSecondary,
    agentEnabled: settings.agentEnabled === true,
    agent: readAgent(row.settings),
  };
}

/** `""` (campo vaciado en el formulario) → `null`; `undefined` → no tocar. */
function nullify(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === "" ? null : value;
}

export async function getBranding(businessId: string): Promise<BusinessBranding> {
  const row = await adminBusinessRepository.findBranding(businessId);
  if (!row) {
    throw new NotFoundError("Negocio no encontrado.");
  }
  return toBranding(row);
}

export async function updateBranding(
  businessId: string,
  input: UpdateBrandingInput,
  actor: string,
): Promise<BusinessBranding> {
  const before = await adminBusinessRepository.findBranding(businessId);
  if (!before) {
    throw new NotFoundError("Negocio no encontrado.");
  }

  const settings = readBusinessSettings(before.settings);
  const nextSettings: Record<string, unknown> = { ...settings };

  if (input.agentEnabled !== undefined) {
    nextSettings.agentEnabled = input.agentEnabled;
  }
  if (input.agent) {
    const merged = mergeTextPatch(readAgent(before.settings) as Record<string, string | undefined>, input.agent);
    // Un `agent` vacío no aporta nada al payload que se le manda a n8n.
    if (Object.keys(merged).length > 0) nextSettings.agent = merged as AgentSettings;
    else delete nextSettings.agent;
  }

  const data: Prisma.BusinessUpdateInput = {
    logoUrl: nullify(input.logoUrl),
    colorPrimary: nullify(input.colorPrimary),
    colorSecondary: nullify(input.colorSecondary),
    settings: nextSettings as Prisma.InputJsonValue,
  };

  const row = await adminBusinessRepository.updateBranding(businessId, data);
  const branding = toBranding(row);

  await auditLogRepository.record({
    actor,
    action: "business.branding.update",
    businessId,
    before: toBranding(before) as unknown as Prisma.InputJsonValue,
    after: branding as unknown as Prisma.InputJsonValue,
  });
  logger.info({ actor, businessId }, "admin_business_branding_updated");

  return branding;
}
