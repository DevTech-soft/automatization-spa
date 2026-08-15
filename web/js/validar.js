import { apiRequest, ApiError, formatCurrency, formatDateLong } from "/js/api.js";

const els = {
  lookupForm: document.getElementById("lookupForm"),
  lookupError: document.getElementById("lookupError"),
  resultPanel: document.getElementById("resultPanel"),
  resultEyebrow: document.getElementById("resultEyebrow"),
  resultTitle: document.getElementById("resultTitle"),
  resultDetails: document.getElementById("resultDetails"),
  redeemForm: document.getElementById("redeemForm"),
  redeemError: document.getElementById("redeemError"),
  redeemButton: document.getElementById("redeemButton"),
};

let currentCode = null;

function showAlert(container, message) {
  container.innerHTML = "";
  if (!message) return;
  const box = document.createElement("div");
  box.className = "alert alert--error";
  box.setAttribute("role", "alert");
  box.textContent = message;
  container.appendChild(box);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function errorMessage(error) {
  return error instanceof ApiError ? error.message : "No pudimos conectar con el servidor. Intenta de nuevo.";
}

const STATUS_LABELS = {
  PENDING: "Pendiente de pago",
  PAID: "Pagada, sin enviar",
  SENT: "Enviada al comprador",
  REDEEMED: "Ya canjeada",
  EXPIRED: "Expirada",
  CANCELLED: "Cancelada",
};

els.lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAlert(els.lookupError, "");
  const code = String(new FormData(els.lookupForm).get("code") ?? "").trim();
  if (!code) return;

  try {
    const result = await apiRequest("/api/gift-cards/validate", { method: "POST", body: { code } });
    currentCode = code;
    renderResult(result);
  } catch (error) {
    els.resultPanel.hidden = true;
    showAlert(els.lookupError, errorMessage(error));
  }
});

function renderResult(result) {
  els.resultPanel.hidden = false;
  els.resultEyebrow.textContent = result.valid ? "Válida" : "No válida";
  els.resultTitle.textContent = result.valid ? "Se puede canjear" : STATUS_LABELS[result.status] ?? result.status;

  els.resultDetails.innerHTML = `
    <div class="receipt__row"><span class="receipt__label">Servicio</span><span>${escapeHtml(result.serviceName)}</span></div>
    <div class="receipt__row"><span class="receipt__label">Destinatario</span><span>${escapeHtml(result.recipientName)}</span></div>
    <div class="receipt__row"><span class="receipt__label">Comprador</span><span>${escapeHtml(result.buyerName)}</span></div>
    <div class="receipt__row"><span class="receipt__label">Valor</span><span>${formatCurrency(result.amount, "COP")}</span></div>
    <div class="receipt__row"><span class="receipt__label">Comprada</span><span>${formatDateLong(result.purchasedAt.slice(0, 10))}</span></div>
    ${result.expiresAt ? `<div class="receipt__row"><span class="receipt__label">Expira</span><span>${formatDateLong(result.expiresAt.slice(0, 10))}</span></div>` : ""}
    <div class="receipt__row receipt__row--total"><span>Estado</span><span>${STATUS_LABELS[result.status] ?? result.status}</span></div>
  `;

  els.redeemForm.hidden = !result.valid;
  showAlert(els.redeemError, "");
}

els.redeemForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAlert(els.redeemError, "");
  const staffPin = String(new FormData(els.redeemForm).get("staffPin") ?? "").trim();
  if (!staffPin || !currentCode) return;

  els.redeemButton.disabled = true;
  els.redeemButton.textContent = "Canjeando…";

  try {
    await apiRequest("/api/gift-cards/redeem", { method: "POST", body: { code: currentCode, staffPin } });
    els.resultEyebrow.textContent = "Canjeada";
    els.resultTitle.textContent = "¡Listo! Gift Card canjeada.";
    els.redeemForm.hidden = true;
  } catch (error) {
    showAlert(els.redeemError, errorMessage(error));
  } finally {
    els.redeemButton.disabled = false;
    els.redeemButton.textContent = "Canjear";
  }
});
