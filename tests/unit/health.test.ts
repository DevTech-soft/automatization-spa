import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/prisma.js", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    $disconnect: vi.fn(),
  },
}));

const { buildApp } = await import("../../src/app.js");

describe("GET /health", () => {
  it("responde 200 cuando la base de datos está disponible", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", db: "ok" });

    await app.close();
  });
});
