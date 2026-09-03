import { describe, expect, it } from "vitest";
import { assertBusinessOperational, isBusinessOperational } from "../../src/services/business-guard.js";
import { BusinessSuspendedError, NotFoundError } from "../../src/errors/index.js";

function biz(status: string, active = true) {
  return { status, active } as never;
}

describe("business-guard", () => {
  describe("isBusinessOperational", () => {
    it("es true para TRIAL, ACTIVE y PAST_DUE", () => {
      expect(isBusinessOperational(biz("TRIAL"))).toBe(true);
      expect(isBusinessOperational(biz("ACTIVE"))).toBe(true);
      expect(isBusinessOperational(biz("PAST_DUE"))).toBe(true);
    });

    it("es false para SUSPENDED y CANCELLED", () => {
      expect(isBusinessOperational(biz("SUSPENDED"))).toBe(false);
      expect(isBusinessOperational(biz("CANCELLED"))).toBe(false);
    });

    it("es false si el flag legacy active es false, sin importar el status", () => {
      expect(isBusinessOperational(biz("ACTIVE", false))).toBe(false);
    });
  });

  describe("assertBusinessOperational", () => {
    it("no lanza para un negocio operativo", () => {
      expect(() => assertBusinessOperational(biz("ACTIVE"))).not.toThrow();
      expect(() => assertBusinessOperational(biz("PAST_DUE"))).not.toThrow();
    });

    it("lanza BusinessSuspendedError (403) para SUSPENDED", () => {
      try {
        assertBusinessOperational(biz("SUSPENDED"));
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessSuspendedError);
        expect((error as BusinessSuspendedError).statusCode).toBe(403);
      }
    });

    it("lanza NotFoundError (404) para CANCELLED", () => {
      try {
        assertBusinessOperational(biz("CANCELLED"));
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
        expect((error as NotFoundError).statusCode).toBe(404);
      }
    });

    it("lanza NotFoundError (404) para active=false (no revela que el negocio existe)", () => {
      expect(() => assertBusinessOperational(biz("ACTIVE", false))).toThrow(NotFoundError);
    });
  });
});
