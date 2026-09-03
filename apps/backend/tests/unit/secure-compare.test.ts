import { describe, expect, it } from "vitest";
import { secureCompare } from "../../src/utils/secure-compare.js";

describe("secureCompare", () => {
  it("devuelve true cuando ambos strings son iguales", () => {
    expect(secureCompare("1234", "1234")).toBe(true);
  });

  it("devuelve false cuando difieren de la misma longitud", () => {
    expect(secureCompare("1234", "5678")).toBe(false);
  });

  it("devuelve false cuando tienen longitud distinta, sin lanzar", () => {
    expect(secureCompare("123", "123456")).toBe(false);
  });

  it("devuelve false contra un string vacío", () => {
    expect(secureCompare("1234", "")).toBe(false);
  });
});
