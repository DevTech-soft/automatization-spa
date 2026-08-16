import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { errorHandler } from "../../src/middlewares/error-handler.js";
import { NotFoundError } from "../../src/errors/index.js";

function fakeRequest(id = "req-1"): FastifyRequest {
  return { id, log: { warn: vi.fn(), error: vi.fn() } } as unknown as FastifyRequest;
}

function fakeReply(): FastifyReply & { status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
  const reply = {} as FastifyReply & { status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
  reply.status = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  return reply;
}

describe("errorHandler", () => {
  it("responde con el statusCode y code de un AppError", () => {
    const request = fakeRequest();
    const reply = fakeReply();

    errorHandler(new NotFoundError("Negocio no encontrado."), request, reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({
      error: { code: "NOT_FOUND", message: "Negocio no encontrado.", requestId: "req-1" },
    });
  });

  it("responde 400 VALIDATION_ERROR para un ZodError, sin exponer los issues", () => {
    const request = fakeRequest();
    const reply = fakeReply();
    const result = z.object({ name: z.string() }).safeParse({});

    errorHandler(result.error!, request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    const [body] = reply.send.mock.calls[0] as [{ error: Record<string, unknown> }];
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error).not.toHaveProperty("issues");
  });

  it("pasa el statusCode 429 de un error de rate limit en vez de devolver 500", () => {
    const request = fakeRequest();
    const reply = fakeReply();
    const rateLimitError = Object.assign(new Error("Rate limit exceeded"), { statusCode: 429 });

    errorHandler(rateLimitError, request, reply);

    expect(reply.status).toHaveBeenCalledWith(429);
    expect(reply.send).toHaveBeenCalledWith({
      error: { code: "TOO_MANY_REQUESTS", message: expect.any(String), requestId: "req-1" },
    });
  });

  it("pasa el statusCode 403 de un error de plugin (ej. @fastify/static) en vez de devolver 500", () => {
    const request = fakeRequest();
    const reply = fakeReply();
    const forbidden = Object.assign(new Error("Forbidden"), { statusCode: 403 });

    errorHandler(forbidden, request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: { code: "CLIENT_ERROR", message: expect.any(String), requestId: "req-1" },
    });
  });

  it("devuelve 500 INTERNAL_ERROR sin exponer el mensaje ni el stack de un error inesperado", () => {
    const request = fakeRequest();
    const reply = fakeReply();

    errorHandler(new Error("boom, ruta interna del filesystem"), request, reply);

    expect(reply.status).toHaveBeenCalledWith(500);
    const [body] = reply.send.mock.calls[0] as [{ error: Record<string, unknown> }];
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("boom");
  });
});
