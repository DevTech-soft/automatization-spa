import puppeteer from "puppeteer";
import { decorationFor } from "./gift-card-motifs.js";

export interface GiftCardImageInput {
  businessName: string;
  recipientName: string;
  buyerName: string;
  serviceName: string;
  message?: string | undefined;
  code: string;
  design: string;
}

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

/**
 * `clasico`/`clasico-puente` y `floral`/`floral-tulipanes` son pares: misma
 * paleta, distinto motivo decorativo (`gift-card-motifs.ts`) — le da al
 * comprador dos variantes por categoría entre las que elegir (sección 14).
 */
const DESIGNS: Record<string, { bg: string; bgAlt: string; ink: string; accent: string; accentTint: string }> = {
  clasico: { bg: "#f7f2ea", bgAlt: "#e7ede4", ink: "#23301f", accent: "#3f5a44", accentTint: "#c1633d" },
  "clasico-puente": { bg: "#f7f2ea", bgAlt: "#e7ede4", ink: "#23301f", accent: "#3f5a44", accentTint: "#c1633d" },
  floral: { bg: "#fbeee6", bgAlt: "#f5d9c8", ink: "#3a2418", accent: "#c1633d", accentTint: "#3f5a44" },
  "floral-tulipanes": { bg: "#fbeee6", bgAlt: "#f5d9c8", ink: "#3a2418", accent: "#c1633d", accentTint: "#3f5a44" },
  elegante: { bg: "#1b1f1c", bgAlt: "#262b26", ink: "#f3ede0", accent: "#c9a24b", accentTint: "#f3ede0" },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(input: GiftCardImageInput): string {
  const palette = DESIGNS[input.design] ?? DESIGNS["clasico"]!;
  const message = input.message ? escapeHtml(input.message) : "";
  const decoration = decorationFor(input.design, palette.accent, palette.accentTint);
  // Corner del motivo: floral "crece" desde abajo, torre/puente se paran en
  // la base, laurel es un filete de esquina — cada uno ancla distinto.
  const decorPosition = input.design === "elegante" ? "top: 8px; right: 8px;" : "bottom: -18px; right: -16px;";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        width: ${CARD_WIDTH}px;
        height: ${CARD_HEIGHT}px;
        font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif;
        background: ${palette.bg};
        background-image: radial-gradient(60% 60% at 100% 0%, ${palette.bgAlt} 0%, transparent 60%);
        color: ${palette.ink};
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 64px 72px;
        position: relative;
        overflow: hidden;
      }
      .content, .footer { position: relative; z-index: 1; }
      .decor {
        position: absolute;
        z-index: 0;
        opacity: 0.55;
        pointer-events: none;
        ${decorPosition}
      }
      .eyebrow {
        font-family: -apple-system, "Segoe UI", sans-serif;
        text-transform: uppercase;
        letter-spacing: 4px;
        font-size: 15px;
        color: ${palette.accent};
      }
      .title {
        font-size: 40px;
        margin-top: 10px;
      }
      .body {
        font-size: 26px;
        line-height: 1.5;
        max-width: 900px;
      }
      .message {
        font-style: italic;
        font-size: 22px;
        margin-top: 18px;
        color: ${palette.ink};
        opacity: 0.85;
      }
      .footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
      }
      .code {
        font-family: -apple-system, "Segoe UI", sans-serif;
        font-size: 22px;
        letter-spacing: 2px;
        padding: 10px 22px;
        border-radius: 999px;
        background: ${palette.accent};
        color: ${palette.bg};
      }
      .business {
        font-family: -apple-system, "Segoe UI", sans-serif;
        font-size: 16px;
        text-transform: uppercase;
        letter-spacing: 2px;
        opacity: 0.7;
      }
    </style>
  </head>
  <body>
    ${decoration ? `<div class="decor">${decoration}</div>` : ""}
    <div class="content">
      <p class="eyebrow">Gift Card &middot; ${escapeHtml(input.businessName)}</p>
      <p class="title">Para ${escapeHtml(input.recipientName)}</p>
      <p class="body">Un regalo de <strong>${escapeHtml(input.buyerName)}</strong> para disfrutar de<br />
        <strong>${escapeHtml(input.serviceName)}</strong>.</p>
      ${message ? `<p class="message">&ldquo;${message}&rdquo;</p>` : ""}
    </div>
    <div class="footer">
      <span class="business">${escapeHtml(input.businessName)}</span>
      <span class="code">${escapeHtml(input.code)}</span>
    </div>
  </body>
</html>`;
}

/** Renderiza la Gift Card como PNG (sección 15) usando Puppeteer sobre un template HTML/CSS (decisión de Fase 0). */
export async function renderGiftCardImage(input: GiftCardImageInput): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: CARD_WIDTH, height: CARD_HEIGHT });
    await page.setContent(buildHtml(input), { waitUntil: "load" });
    const screenshot = await page.screenshot({ type: "png" });
    return Buffer.from(screenshot);
  } finally {
    await browser.close();
  }
}
