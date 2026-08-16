import { apiRequest, ApiError, formatCurrency, formatDateLong } from "/js/api.js";
import { renderCardPreview } from "/js/gift-card-preview.js";

const STEP_ORDER = ["service", "buyer", "recipient", "design", "summary"];

const els = {
  brandName: document.getElementById("brandName"),
  steps: document.getElementById("steps"),
  summaryStrip: document.getElementById("summaryStrip"),
  panels: Object.fromEntries(STEP_ORDER.map((name) => [name, document.querySelector(`[data-panel="${name}"]`)])),
  serviceList: document.getElementById("serviceList"),
  serviceError: document.getElementById("serviceError"),
  designGrid: document.getElementById("designGrid"),
  cardPreview: document.getElementById("cardPreview"),
  cardCanvas: document.getElementById("cardCanvas"),
  designContinueButton: document.getElementById("designContinueButton"),
  buyerForm: document.getElementById("buyerForm"),
  recipientForm: document.getElementById("recipientForm"),
  receipt: document.getElementById("receipt"),
  summaryError: document.getElementById("summaryError"),
  payButton: document.getElementById("payButton"),
};

const state = {
  negocioSlug: new URLSearchParams(location.search).get("negocio") || "demo-spa",
  business: null,
  services: [],
  service: null,
  design: null,
  buyer: { buyerName: "", buyerPhone: "", buyerEmail: "" },
  recipient: { recipientName: "", recipientPhone: "", message: "", scheduledDate: "" },
  currentStep: "service",
};

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

function goToStep(name) {
  state.currentStep = name;
  const currentIndex = STEP_ORDER.indexOf(name);

  for (const step of STEP_ORDER) {
    els.panels[step].hidden = step !== name;
  }

  [...els.steps.children].forEach((item, index) => {
    item.classList.toggle("is-current", index === currentIndex);
    item.classList.toggle("is-done", index < currentIndex);
  });

  renderSummaryStrip();
  if (name === "design") updatePreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderSummaryStrip() {
  const parts = [];
  if (state.service) {
    parts.push(`<span class="summary-strip__item"><strong>${escapeHtml(state.service.name)}</strong></span>`);
  }
  if (state.design) {
    parts.push(`<span class="summary-strip__item">${escapeHtml(DESIGN_LABELS[state.design] ?? state.design)}</span>`);
  }
  if (state.service) {
    parts.push(
      `<span class="summary-strip__item">${formatCurrency(state.service.price, state.business?.currency)}</span>`,
    );
  }
  els.summaryStrip.innerHTML = parts.join("");
  els.summaryStrip.classList.toggle("is-visible", state.currentStep !== "service" && parts.length > 0);
}

function errorMessage(error) {
  return error instanceof ApiError ? error.message : "No pudimos conectar con el servidor. Intenta de nuevo.";
}

// ---------- Paso 1: experiencia ----------

function renderServices() {
  els.serviceList.innerHTML = "";
  if (state.services.length === 0) {
    els.serviceList.innerHTML = '<p class="empty-state">Este negocio no tiene servicios disponibles todavía.</p>';
    return;
  }

  state.services.forEach((service, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "option-card";
    card.style.animationDelay = `${index * 60}ms`;
    card.innerHTML = `
      <div class="option-card__body">
        <h3>${escapeHtml(service.name)}</h3>
        <p class="option-card__meta">${service.description ? escapeHtml(service.description) : `${service.durationMinutes} min`}</p>
      </div>
      <div class="option-card__price">${formatCurrency(service.price, state.business?.currency)}</div>
    `;
    card.addEventListener("click", () => {
      state.service = service;
      goToStep("buyer");
    });
    els.serviceList.appendChild(card);
  });
}

// ---------- Paso 2: comprador ----------

const BUYER_VALIDATORS = {
  buyerName: (value) => value.trim().length >= 2,
  buyerPhone: (value) => /^\+?[0-9][0-9\s-]{6,17}$/.test(value.trim()),
  buyerEmail: (value) => value.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
};

els.buyerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(els.buyerForm);
  let valid = true;

  for (const [name, validate] of Object.entries(BUYER_VALIDATORS)) {
    const value = String(formData.get(name) ?? "");
    const field = els.buyerForm.querySelector(`[data-field="${name}"]`);
    const ok = validate(value);
    field.classList.toggle("has-error", !ok);
    if (!ok) valid = false;
  }
  if (!valid) return;

  state.buyer = {
    buyerName: String(formData.get("buyerName")).trim(),
    buyerPhone: String(formData.get("buyerPhone")).trim(),
    buyerEmail: String(formData.get("buyerEmail") ?? "").trim() || undefined,
  };
  goToStep("recipient");
});

// ---------- Paso 3: destinatario ----------

const RECIPIENT_VALIDATORS = {
  recipientName: (value) => value.trim().length >= 2,
  recipientPhone: (value) => value.trim() === "" || /^\+?[0-9][0-9\s-]{6,17}$/.test(value.trim()),
};

els.recipientForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(els.recipientForm);
  let valid = true;

  for (const [name, validate] of Object.entries(RECIPIENT_VALIDATORS)) {
    const value = String(formData.get(name) ?? "");
    const field = els.recipientForm.querySelector(`[data-field="${name}"]`);
    const ok = validate(value);
    field.classList.toggle("has-error", !ok);
    if (!ok) valid = false;
  }
  if (!valid) return;

  state.recipient = {
    recipientName: String(formData.get("recipientName")).trim(),
    recipientPhone: String(formData.get("recipientPhone") ?? "").trim() || undefined,
    message: String(formData.get("message") ?? "").trim() || undefined,
    scheduledDate: String(formData.get("scheduledDate") ?? "").trim() || undefined,
  };
  goToStep("design");
});

// ---------- Paso 4: diseño (con preview en vivo) ----------

/** Redibuja la tarjeta a tamaño real con los datos ya cargados (sección de diseño, penúltimo paso a propósito). */
function updatePreview() {
  renderCardPreview(els.cardPreview, els.cardCanvas, {
    design: state.design,
    businessName: state.business?.name ?? "",
    recipientName: state.recipient.recipientName,
    buyerName: state.buyer.buyerName,
    serviceName: state.service?.name ?? "",
    message: state.recipient.message,
  });
}

els.designGrid.querySelectorAll("[data-design]").forEach((button) => {
  button.addEventListener("click", () => {
    state.design = button.dataset.design;
    els.designGrid.querySelectorAll("[data-design]").forEach((b) => b.classList.toggle("is-selected", b === button));
    els.designContinueButton.disabled = false;
    updatePreview();
  });
});

els.designContinueButton.addEventListener("click", () => {
  if (!state.design) return;
  renderReceipt();
  goToStep("summary");
});

let previewResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(previewResizeTimer);
  previewResizeTimer = setTimeout(() => {
    if (state.currentStep === "design") updatePreview();
  }, 120);
});

// ---------- Paso 5: resumen y pago ----------

const DESIGN_LABELS = {
  clasico: "Clásico · Torre Eiffel",
  "clasico-puente": "Clásico · Puente",
  floral: "Floral · Rosas",
  "floral-tulipanes": "Floral · Tulipanes",
  elegante: "Elegante",
};

function renderReceipt() {
  els.receipt.innerHTML = `
    <div class="receipt__row"><span class="receipt__label">Experiencia</span><span>${escapeHtml(state.service.name)}</span></div>
    <div class="receipt__row"><span class="receipt__label">Diseño</span><span>${DESIGN_LABELS[state.design] ?? state.design}</span></div>
    <div class="receipt__row"><span class="receipt__label">Comprador</span><span>${escapeHtml(state.buyer.buyerName)}</span></div>
    <div class="receipt__row"><span class="receipt__label">Destinatario</span><span>${escapeHtml(state.recipient.recipientName)}</span></div>
    ${state.recipient.scheduledDate ? `<div class="receipt__row"><span class="receipt__label">Fecha deseada</span><span>${formatDateLong(state.recipient.scheduledDate)}</span></div>` : ""}
    <div class="receipt__row receipt__row--total"><span>Total</span><span>${formatCurrency(state.service.price, state.business?.currency)}</span></div>
  `;
}

els.payButton.addEventListener("click", async () => {
  showAlert(els.summaryError, "");
  setPaying(true);

  try {
    const giftCard = await apiRequest("/api/gift-cards", {
      method: "POST",
      body: {
        businessId: state.business.id,
        serviceId: state.service.id,
        design: state.design,
        ...state.buyer,
        ...state.recipient,
      },
    });

    const payment = await apiRequest("/api/payments/create", {
      method: "POST",
      body: { entityType: "GIFT_CARD", entityId: giftCard.id },
    });

    window.location.href = payment.paymentUrl;
  } catch (error) {
    setPaying(false);
    showAlert(els.summaryError, errorMessage(error));
  }
});

function setPaying(isPaying) {
  els.payButton.disabled = isPaying;
  els.payButton.innerHTML = isPaying
    ? '<span class="spinner"></span> Redirigiendo al pago…'
    : "Pagar con Wompi";
}

// ---------- back links ----------

document.querySelectorAll("[data-panel] [data-back]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const currentIndex = STEP_ORDER.indexOf(state.currentStep);
    if (currentIndex > 0) goToStep(STEP_ORDER[currentIndex - 1]);
  });
});

// ---------- init ----------

async function init() {
  try {
    state.business = await apiRequest(`/api/business/${state.negocioSlug}`);
    els.brandName.textContent = state.business.name;
    document.title = `Regalar — ${state.business.name}`;

    state.services = await apiRequest(`/api/services?businessId=${state.business.id}`);
    renderServices();
    goToStep("service");
  } catch (error) {
    els.serviceList.innerHTML = "";
    showAlert(els.serviceError, errorMessage(error));
    goToStep("service");
  }
}

init();
