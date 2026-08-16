import { describe, expect, it } from "vitest";
import { decorationFor } from "../../src/services/gift-card-motifs.js";
import { GIFT_CARD_DESIGNS } from "../../src/config/constants.js";

describe("decorationFor", () => {
  it("devuelve un <svg> no vacío para cada diseño soportado (GIFT_CARD_DESIGNS)", () => {
    for (const design of GIFT_CARD_DESIGNS) {
      const svg = decorationFor(design, "#3f5a44", "#c1633d");
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    }
  });

  it("devuelve string vacío para un diseño desconocido, sin lanzar", () => {
    expect(decorationFor("no-existe", "#000", "#fff")).toBe("");
  });
});
