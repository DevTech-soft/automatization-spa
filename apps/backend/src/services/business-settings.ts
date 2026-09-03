import type { AgentSettings } from "@spa/shared";

/**
 * Lectura tipada del JSON `Business.settings`. La columna es libre a propósito
 * (docs/PANEL-OPERADOR.md §4), así que nadie debe asumir su forma: este módulo
 * es el único lugar donde se interpreta desde el panel.
 *
 * El runtime del bot lee `agentEnabled`/`agent` por su cuenta en
 * `integrations/n8n/AgentForwarder.ts`; aquí solo se leen y escriben las mismas
 * claves sin tocar el resto del objeto.
 */
export interface BusinessSettings {
  agentEnabled?: boolean;
  agent?: AgentSettings;
  /** Marcas del checklist que el panel no puede derivar de la data (§6.1). */
  onboarding?: {
    whatsappProfileApproved?: boolean;
  };
  /** Google Sheet por negocio (§6.1 paso 7, opcional). */
  googleSheetId?: string;
  [key: string]: unknown;
}

export function readBusinessSettings(settings: unknown): BusinessSettings {
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as BusinessSettings)
    : {};
}

export function readAgent(settings: unknown): AgentSettings {
  const { agent } = readBusinessSettings(settings);
  return agent && typeof agent === "object" && !Array.isArray(agent) ? agent : {};
}

/**
 * Aplica un parche de texto sobre un objeto de settings: `undefined` deja el
 * valor como está y `""` borra la clave (así el operador puede vaciar un campo
 * del formulario sin que quede una cadena vacía en el JSON).
 */
export function mergeTextPatch<T extends Record<string, string | undefined>>(
  current: T,
  patch: Partial<Record<keyof T, string | undefined>>,
): T {
  const next: Record<string, string> = { ...current } as Record<string, string>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === "") delete next[key];
    else next[key] = value;
  }
  return next as T;
}
