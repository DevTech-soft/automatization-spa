import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BELLEZA_URL = "http://n8n.test/webhook/agente-reservas";
const SALUD_URL = "http://n8n.test/webhook/agente-salud";

vi.mock("../../src/config/env.js", () => ({
  env: {
    N8N_AGENT_WEBHOOK_URL: "http://n8n.test/webhook/agente-reservas",
    N8N_AGENT_WEBHOOKS: { salud: "http://n8n.test/webhook/agente-salud" },
    N8N_AGENT_TOKEN: "token-agente",
    N8N_AGENT_TIMEOUT_MS: 1000,
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { env } = await import("../../src/config/env.js");
const { forwardToAgent, isAgentEnabled, readBusinessVertical, resolveAgentWebhookUrl } = await import(
  "../../src/integrations/n8n/AgentForwarder.js"
);

const basePayload = {
  businessId: "biz-1",
  businessName: "Consultorio",
  timezone: "America/Bogota",
  currency: "COP",
  phone: "573001112233",
  text: "hola",
  agent: {},
  payments: { payAtVenue: false, depositPercentage: null },
};

describe("verticales del agente", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    env.N8N_AGENT_WEBHOOK_URL = BELLEZA_URL;
  });

  it("un negocio sin vertical guardado es de belleza", () => {
    expect(readBusinessVertical({})).toBe("belleza");
    expect(readBusinessVertical({ vertical: "inventado" })).toBe("belleza");
    expect(readBusinessVertical({ vertical: "mascotas" })).toBe("mascotas");
  });

  it("usa el webhook propio del vertical y cae al de belleza si no tiene uno", () => {
    expect(resolveAgentWebhookUrl("salud")).toBe(SALUD_URL);
    expect(resolveAgentWebhookUrl("barberia")).toBe(BELLEZA_URL);
    expect(resolveAgentWebhookUrl("belleza")).toBe(BELLEZA_URL);
  });

  it("reenvía al workflow del vertical", async () => {
    await expect(forwardToAgent({ ...basePayload, vertical: "salud" })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(SALUD_URL, expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.vertical).toBe("salud");
  });

  it("sin webhook para el vertical ni por defecto, el agente queda apagado", async () => {
    env.N8N_AGENT_WEBHOOK_URL = "";
    expect(isAgentEnabled({ agentEnabled: true, vertical: "barberia" })).toBe(false);
    expect(isAgentEnabled({ agentEnabled: true, vertical: "salud" })).toBe(true);
    await expect(forwardToAgent({ ...basePayload, vertical: "barberia" })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
