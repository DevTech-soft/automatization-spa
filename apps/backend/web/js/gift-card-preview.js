/**
 * Preview en vivo de la Gift Card (rediseño post-Fase 8). Espejo en vanilla
 * JS de `src/services/gift-card-motifs.ts` + `gift-card-image.service.ts`
 * (backend, Puppeteer) — sin build step no hay forma de compartir código
 * entre server y frontend (sección 3), así que se duplica a propósito. Si
 * cambia un diseño en el backend, replicar el cambio acá.
 */

export const GIFT_CARD_PALETTES = {
  clasico: { bg: "#f7f2ea", bgAlt: "#e7ede4", ink: "#23301f", accent: "#3f5a44", accentTint: "#c1633d" },
  "clasico-puente": { bg: "#f7f2ea", bgAlt: "#e7ede4", ink: "#23301f", accent: "#3f5a44", accentTint: "#c1633d" },
  floral: { bg: "#fbeee6", bgAlt: "#f5d9c8", ink: "#3a2418", accent: "#c1633d", accentTint: "#3f5a44" },
  "floral-tulipanes": { bg: "#fbeee6", bgAlt: "#f5d9c8", ink: "#3a2418", accent: "#c1633d", accentTint: "#3f5a44" },
  elegante: { bg: "#1b1f1c", bgAlt: "#262b26", ink: "#f3ede0", accent: "#c9a24b", accentTint: "#f3ede0" },
};

const PETAL_PATH = "M0 0 C12 -8 12 -42 0 -50 C-12 -42 -12 -8 0 0 Z";

function petal(x, y, rotateDeg, scale, fill, opacity = 1) {
  return `<g transform="translate(${x} ${y}) rotate(${rotateDeg}) scale(${scale})"><path d="${PETAL_PATH}" fill="${fill}" opacity="${opacity}"/></g>`;
}

function radialFlower(cx, cy, count, scale, fill, centerFill, centerR, opacity = 1) {
  let petals = "";
  for (let i = 0; i < count; i++) petals += petal(cx, cy, (360 / count) * i, scale, fill, opacity);
  return `${petals}<circle cx="${cx}" cy="${cy}" r="${centerR}" fill="${centerFill}"/>`;
}

function fanFlower(cx, cy, fills, scale) {
  const spread = 26;
  const start = -((fills.length - 1) / 2) * spread;
  return fills
    .map((fill, i) => petal(cx, cy, start + i * spread, i === Math.floor(fills.length / 2) ? scale * 1.1 : scale, fill))
    .join("");
}

function stem(d, stroke, opacity = 0.55, width = 2.5) {
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round"/>`;
}

function roseCluster(accent, accentTint) {
  return `<svg viewBox="0 0 220 260" width="220" height="260" xmlns="http://www.w3.org/2000/svg">
    ${stem("M110 260 C104 190 118 150 112 96", accent)}
    ${stem("M40 260 C50 220 60 210 68 190", accent)}
    ${stem("M180 260 C168 224 158 216 150 202", accent)}
    ${petal(70, 214, -35, 0.9, accent, 0.85)}
    ${petal(150, 226, 40, 0.85, accent, 0.85)}
    ${radialFlower(40, 190, 5, 0.55, accentTint, accent, 4.5, 0.9)}
    ${radialFlower(170, 204, 5, 0.5, accentTint, accent, 4, 0.9)}
    ${radialFlower(112, 92, 5, 1.35, accent, "#ffffff", 10)}
  </svg>`;
}

function tulipCluster(accent, accentTint) {
  return `<svg viewBox="0 0 220 260" width="220" height="260" xmlns="http://www.w3.org/2000/svg">
    ${stem("M70 260 C72 200 78 170 76 128", accent)}
    ${stem("M112 260 C110 190 114 150 112 100", accent)}
    ${stem("M154 260 C150 202 146 172 148 132", accent)}
    ${petal(50, 240, -50, 0.8, accent, 0.75)}
    ${petal(174, 246, 48, 0.8, accent, 0.75)}
    ${fanFlower(76, 122, [accentTint, accent, accentTint], 1.05)}
    ${fanFlower(112, 94, [accentTint, accent, accentTint], 1.25)}
    ${fanFlower(148, 126, [accentTint, accent, accentTint], 1.0)}
  </svg>`;
}

function eiffelTower(accent) {
  return `<svg viewBox="0 0 200 400" width="150" height="300" xmlns="http://www.w3.org/2000/svg">
    <path d="M100,0 L94,30 L106,30 L100,0 Z M94,30 L82,170 L64,176 L76,182 L58,320 L38,326 L52,332 L10,400 L190,400 L148,332 L162,326 L142,320 L124,182 L136,176 L118,170 L106,30 Z"
      fill="${accent}" opacity="0.8" fill-rule="evenodd"/>
  </svg>`;
}

function archBridge(accent) {
  const hangers = [65, 92, 148, 175]
    .map((x) => `<line x1="${x}" y1="52" x2="${x}" y2="108" stroke="${accent}" stroke-width="2.5" opacity="0.6"/>`)
    .join("");
  return `<svg viewBox="0 0 240 170" width="220" height="156" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 30 Q120 96 222 30" fill="none" stroke="${accent}" stroke-width="5" opacity="0.7" stroke-linecap="round"/>
    ${hangers}
    <rect x="10" y="108" width="220" height="14" rx="4" fill="${accent}" opacity="0.85"/>
    <rect x="38" y="14" width="18" height="120" rx="6" fill="${accent}" opacity="0.85"/>
    <rect x="184" y="14" width="18" height="120" rx="6" fill="${accent}" opacity="0.85"/>
    <line x1="0" y1="150" x2="240" y2="150" stroke="${accent}" stroke-width="1.5" opacity="0.3"/>
  </svg>`;
}

function laurelSprig(accent) {
  const leaves = [
    [18, 96, -35, 0.55],
    [30, 74, 35, 0.5],
    [42, 60, -30, 0.5],
    [54, 40, 32, 0.45],
    [66, 22, -28, 0.42],
    [76, 8, 30, 0.38],
  ];
  return `<svg viewBox="0 0 100 110" width="150" height="165" xmlns="http://www.w3.org/2000/svg">
    ${stem("M8 108 Q40 70 88 4", accent, 0.75, 2)}
    ${leaves.map(([x, y, r, s]) => petal(x, y, r, s, accent, 0.85)).join("")}
  </svg>`;
}

function decorationFor(design, accent, accentTint) {
  switch (design) {
    case "floral":
      return roseCluster(accent, accentTint);
    case "floral-tulipanes":
      return tulipCluster(accent, accentTint);
    case "clasico":
      return eiffelTower(accent);
    case "clasico-puente":
      return archBridge(accent);
    case "elegante":
      return laurelSprig(accent);
    default:
      return "";
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

/**
 * Dibuja la tarjeta a tamaño real (1200x630, igual que el PNG que genera
 * Puppeteer) dentro de `canvasEl`, y la escala visualmente con
 * `transform: scale()` para que quepa en `wrapperEl` — así la tipografía y
 * el layout son idénticos al resultado final, no una aproximación.
 */
export function renderCardPreview(wrapperEl, canvasEl, data) {
  const design = data.design && GIFT_CARD_PALETTES[data.design] ? data.design : "clasico";
  const palette = GIFT_CARD_PALETTES[design];
  const decoration = decorationFor(design, palette.accent, palette.accentTint);
  const decorPosition = design === "elegante" ? "top: 8px; right: 8px;" : "bottom: -18px; right: -16px;";
  const message = data.message ? escapeHtml(data.message) : "";

  canvasEl.style.background = palette.bg;
  canvasEl.style.backgroundImage = `radial-gradient(60% 60% at 100% 0%, ${palette.bgAlt} 0%, transparent 60%)`;
  canvasEl.style.color = palette.ink;
  canvasEl.innerHTML = `
    ${decoration ? `<div class="gc-decor" style="${decorPosition}">${decoration}</div>` : ""}
    <div class="gc-content">
      <p class="gc-eyebrow" style="color:${palette.accent}">Gift Card &middot; ${escapeHtml(data.businessName)}</p>
      <p class="gc-title">Para ${escapeHtml(data.recipientName || "quien tú quieras")}</p>
      <p class="gc-body">Un regalo de <strong>${escapeHtml(data.buyerName || "ti")}</strong> para disfrutar de<br />
        <strong>${escapeHtml(data.serviceName)}</strong>.</p>
      ${message ? `<p class="gc-message">&ldquo;${message}&rdquo;</p>` : ""}
    </div>
    <div class="gc-footer">
      <span class="gc-business">${escapeHtml(data.businessName)}</span>
      <span class="gc-code" style="background:${palette.accent};color:${palette.bg}">${escapeHtml(data.code || "GIFT-XXXXXXXX")}</span>
    </div>
  `;

  const scale = wrapperEl.clientWidth / 1200;
  canvasEl.style.transform = `scale(${scale})`;
}
