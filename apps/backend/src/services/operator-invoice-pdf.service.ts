import puppeteer from "puppeteer";
import { DateTime } from "luxon";
import type { InvoiceItem } from "@spa/shared";
import { env } from "../config/env.js";

/**
 * Cuenta de cobro y recibo en PDF (docs/PANEL-OPERADOR.md §6.5). Mismo enfoque
 * que las Gift Cards: template HTML/CSS → Puppeteer → archivo en Storage
 * (`gift-card-image.service.ts`), en vez de una librería de PDF de bajo nivel.
 *
 * Es "cuenta de cobro", no factura: el operador es persona natural sin registro
 * mercantil (D7), así que el documento no lleva línea de impuestos ni
 * numeración DIAN. Cuando se formalice, esto pasa a "Factura de venta" con IVA
 * — el campo `taxes` de `OperatorInvoice` ya existe para ese día.
 */

export interface InvoiceDocumentInput {
  kind: "invoice" | "receipt";
  number: string;
  issuedAt: string;
  dueAt: string;
  clientName: string;
  clientDocument?: string | null;
  clientAddress?: string | null;
  clientEmail?: string | null;
  items: InvoiceItem[];
  subtotal: number;
  total: number;
  currency: string;
  /** Solo en el recibo: cómo y cuándo se pagó. */
  paidAt?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
}

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function parts(date: string): { day: number; month: number; year: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { day: day ?? 1, month: month ?? 1, year: year ?? 1970 };
}

/** "2 sep – 2 oct 2026" (o con los dos años si el período cruza de año). */
export function formatPeriodLabel(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  const left = `${a.day} ${MONTHS_SHORT[a.month - 1]}`;
  const right = `${b.day} ${MONTHS_SHORT[b.month - 1]} ${b.year}`;
  return a.year === b.year ? `${left} – ${right}` : `${left} ${a.year} – ${right}`;
}

/** "02 septiembre 2026" — el encabezado del documento. */
export function formatLongDate(date: string): string {
  const formatted = DateTime.fromISO(date, { zone: "utc" }).setLocale("es").toFormat("dd LLLL yyyy");
  return formatted === "Invalid DateTime" ? date : formatted;
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function operatorLines(): string[] {
  return [env.OPERATOR_DOCUMENT, env.OPERATOR_EMAIL, env.OPERATOR_PHONE, env.OPERATOR_ADDRESS]
    .map((line) => (line ?? "").trim())
    .filter((line) => line.length > 0);
}

function buildHtml(input: InvoiceDocumentInput): string {
  const accent = env.OPERATOR_BRAND_COLOR;
  const isReceipt = input.kind === "receipt";
  const title = isReceipt ? "RECIBO DE PAGO" : "CUENTA DE COBRO";

  const clientLines = [input.clientDocument, input.clientAddress, input.clientEmail]
    .map((line) => (line ?? "").trim())
    .filter((line) => line.length > 0);

  const rows = input.items
    .map(
      (item) => `<tr>
          <td>${escapeHtml(item.concept)}</td>
          <td class="muted">${escapeHtml(item.period)}</td>
          <td class="right">${formatMoney(item.amount, input.currency)}</td>
        </tr>`,
    )
    .join("");

  const paidStamp = isReceipt
    ? `<div class="stamp">PAGADO<span>${escapeHtml(formatLongDate(input.paidAt ?? input.issuedAt))}</span></div>`
    : "";

  const paymentBlock = isReceipt
    ? `<p><strong>Forma de pago:</strong> ${escapeHtml(input.paymentMethod ?? "—")}${
        input.paymentReference ? ` &middot; Ref. ${escapeHtml(input.paymentReference)}` : ""
      }</p>`
    : `<p><strong>Forma de pago:</strong> ${escapeHtml(env.OPERATOR_PAYMENT_INFO || "Transferencia / Nequi / Daviplata")}</p>
       <p class="muted">Vence el ${escapeHtml(formatLongDate(input.dueAt))}.</p>`;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
        color: #1f2328;
        font-size: 13px;
        line-height: 1.5;
        padding: 48px 52px 120px;
        position: relative;
        min-height: 100vh;
      }
      header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
      h1 { font-size: 26px; letter-spacing: 1px; color: ${accent}; }
      .doc-number { font-size: 13px; color: #6b7280; margin-top: 4px; }
      .operator { text-align: right; font-size: 12px; color: #4b5563; }
      .operator strong { display: block; font-size: 15px; color: #1f2328; margin-bottom: 2px; }
      .rule { height: 3px; background: ${accent}; margin: 20px 0 24px; border-radius: 2px; }
      section { margin-bottom: 24px; }
      .label { text-transform: uppercase; letter-spacing: 1.5px; font-size: 10px; color: #6b7280; margin-bottom: 6px; }
      .client strong { font-size: 15px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; color: #6b7280;
           border-bottom: 1px solid #e5e7eb; padding: 0 0 8px; }
      td { padding: 10px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
      .right { text-align: right; white-space: nowrap; }
      .muted { color: #6b7280; }
      .totals { margin-left: auto; width: 260px; margin-top: 12px; }
      .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
      .totals .grand { border-top: 2px solid ${accent}; margin-top: 6px; padding-top: 10px;
                       font-size: 16px; font-weight: 600; }
      .stamp { position: absolute; top: 150px; right: 60px; transform: rotate(-12deg);
               border: 3px solid #16a34a; color: #16a34a; padding: 8px 18px; border-radius: 8px;
               font-size: 24px; font-weight: 700; letter-spacing: 3px; text-align: center; opacity: .9; }
      .stamp span { display: block; font-size: 11px; letter-spacing: 0.5px; font-weight: 500; }
      footer { position: absolute; left: 0; right: 0; bottom: 0; background: ${accent}; color: #fff;
               font-size: 11px; padding: 10px 52px; display: flex; justify-content: space-between; gap: 16px; }
      .pay { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; background: #fafafa; }
      .pay p + p { margin-top: 4px; }
    </style>
  </head>
  <body>
    ${paidStamp}
    <header>
      <div>
        <h1>${title}</h1>
        <p class="doc-number">#${escapeHtml(input.number)}</p>
        <p class="doc-number">${escapeHtml(formatLongDate(input.issuedAt))}</p>
      </div>
      <div class="operator">
        <strong>${escapeHtml(env.OPERATOR_NAME)}</strong>
        ${operatorLines().map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
      </div>
    </header>
    <div class="rule"></div>

    <section class="client">
      <p class="label">Cobrar a</p>
      <strong>${escapeHtml(input.clientName)}</strong>
      ${clientLines.map((line) => `<div class="muted">${escapeHtml(line)}</div>`).join("")}
    </section>

    <section>
      <table>
        <thead>
          <tr><th>Concepto</th><th>Período</th><th class="right">Valor</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <div><span class="muted">Subtotal</span><span>${formatMoney(input.subtotal, input.currency)}</span></div>
        <div class="grand"><span>${isReceipt ? "Total pagado" : "Total a pagar"}</span><span>${formatMoney(
          input.total,
          input.currency,
        )}</span></div>
      </div>
    </section>

    <section class="pay">
      ${paymentBlock}
      <p class="muted">Gracias por confiar en ${escapeHtml(env.OPERATOR_NAME)}.</p>
    </section>

    <footer>
      <span>${escapeHtml(env.OPERATOR_ADDRESS || "")}</span>
      <span>${escapeHtml([env.OPERATOR_PHONE, env.OPERATOR_EMAIL].filter(Boolean).join(" · "))}</span>
    </footer>
  </body>
</html>`;
}

/** Renderiza el documento como PDF tamaño carta. */
export async function renderInvoiceDocument(input: InvoiceDocumentInput): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(input), { waitUntil: "load" });
    const pdf = await page.pdf({ format: "letter", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
