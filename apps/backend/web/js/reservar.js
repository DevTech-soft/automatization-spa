import { apiRequest, ApiError, formatCurrency, formatDateLong } from "/js/api.js";

const STEP_ORDER = ["service", "date", "time", "details", "summary"];

const els = {
  brandName: document.getElementById("brandName"),
  steps: document.getElementById("steps"),
  summaryStrip: document.getElementById("summaryStrip"),
  panels: Object.fromEntries(
    STEP_ORDER.map((name) => [name, document.querySelector(`[data-panel="${name}"]`)]),
  ),
  serviceList: document.getElementById("serviceList"),
  serviceError: document.getElementById("serviceError"),
  dateInput: document.getElementById("dateInput"),
  dateError: document.getElementById("dateError"),
  dateContinue: document.getElementById("dateContinue"),
  timeContent: document.getElementById("timeContent"),
  timeHint: document.getElementById("timeHint"),
  detailsForm: document.getElementById("detailsForm"),
  receipt: document.getElementById("receipt"),
  summaryError: document.getElementById("summaryError"),
  payButton: document.getElementById("payButton"),
};

const state = {
  negocioSlug: new URLSearchParams(location.search).get("negocio") || "demo-spa",
  business: null,
  services: [],
  service: null,
  date: null,
  slot: null,
  customer: { customerName: "", customerPhone: "", customerEmail: "", notes: "" },
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
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderSummaryStrip() {
  const parts = [];
  if (state.service) {
    parts.push(`<span class="summary-strip__item"><strong>${escapeHtml(state.service.name)}</strong></span>`);
  }
  if (state.date) {
    parts.push(`<span class="summary-strip__item">${state.date}</span>`);
  }
  if (state.slot) {
    parts.push(`<span class="summary-strip__item">${state.slot.startTime}</span>`);
  }
  if (state.service) {
    parts.push(
      `<span class="summary-strip__item">${formatCurrency(state.service.price, state.business?.currency)}</span>`,
    );
  }

  els.summaryStrip.innerHTML = parts.join("");
  els.summaryStrip.classList.toggle("is-visible", state.currentStep !== "service" && parts.length > 0);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

// ---------- Paso 1: servicio ----------

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
        <p class="option-card__meta">${service.durationMinutes} min${service.description ? " · " + escapeHtml(service.description) : ""}</p>
      </div>
      <div class="option-card__price">${formatCurrency(service.price, state.business?.currency)}</div>
    `;
    card.addEventListener("click", () => {
      state.service = service;
      state.date = null;
      state.slot = null;
      const minDate = new Date();
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + 60);
      els.dateInput.min = minDate.toISOString().slice(0, 10);
      els.dateInput.max = maxDate.toISOString().slice(0, 10);
      els.dateInput.value = "";
      goToStep("date");
    });
    els.serviceList.appendChild(card);
  });
}

// ---------- Paso 2: fecha ----------

els.dateContinue.addEventListener("click", async () => {
  showAlert(els.dateError, "");
  const date = els.dateInput.value;
  if (!date) {
    showAlert(els.dateError, "Elige una fecha para continuar.");
    return;
  }

  state.date = date;
  await loadAvailability();
});

async function loadAvailability() {
  els.timeContent.innerHTML =
    '<div class="slot-grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
  goToStep("time");

  try {
    const result = await apiRequest(
      `/api/appointments/availability?businessId=${state.business.id}&serviceId=${state.service.id}&date=${state.date}`,
    );
    els.timeHint.textContent = `Horarios disponibles para el ${formatDateLong(state.date)}.`;
    renderSlots(result.slots);
  } catch (error) {
    els.timeContent.innerHTML = "";
    showAlert(els.timeContent, errorMessage(error));
  }
}

// ---------- Paso 3: hora ----------

function renderSlots(slots) {
  const available = slots.filter((slot) => slot.available);
  els.timeContent.innerHTML = "";

  if (available.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <p>Lo sentimos, no tenemos disponibilidad para ese horario.</p>
      <button type="button" class="btn btn-ghost" data-back>Elegir otra fecha</button>
    `;
    empty.querySelector("[data-back]").addEventListener("click", () => goToStep("date"));
    els.timeContent.appendChild(empty);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "slot-grid";
  slots.forEach((slot) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot";
    btn.textContent = slot.startTime;
    btn.disabled = !slot.available;
    if (slot.available) {
      btn.addEventListener("click", () => {
        state.slot = slot;
        goToStep("details");
      });
    }
    grid.appendChild(btn);
  });
  els.timeContent.appendChild(grid);
}

// ---------- Paso 4: datos ----------

const FIELD_VALIDATORS = {
  customerName: (value) => value.trim().length >= 2,
  customerPhone: (value) => /^\+?[0-9][0-9\s-]{6,17}$/.test(value.trim()),
  customerEmail: (value) => value.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
};

els.detailsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(els.detailsForm);
  let valid = true;

  for (const [name, validate] of Object.entries(FIELD_VALIDATORS)) {
    const value = String(formData.get(name) ?? "");
    const field = els.detailsForm.querySelector(`[data-field="${name}"]`);
    const ok = validate(value);
    field.classList.toggle("has-error", !ok);
    if (!ok) valid = false;
  }

  if (!valid) return;

  state.customer = {
    customerName: String(formData.get("customerName")).trim(),
    customerPhone: String(formData.get("customerPhone")).trim(),
    customerEmail: String(formData.get("customerEmail") ?? "").trim() || undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  };

  renderReceipt();
  goToStep("summary");
});

// ---------- Paso 5: resumen y pago ----------

function renderReceipt() {
  els.receipt.innerHTML = `
    <div class="receipt__row"><span class="receipt__label">Servicio</span><span>${escapeHtml(state.service.name)}</span></div>
    <div class="receipt__row"><span class="receipt__label">Fecha</span><span>${formatDateLong(state.date)}</span></div>
    <div class="receipt__row"><span class="receipt__label">Hora</span><span>${state.slot.startTime} – ${state.slot.endTime}</span></div>
    <div class="receipt__row"><span class="receipt__label">Cliente</span><span>${escapeHtml(state.customer.customerName)}</span></div>
    <div class="receipt__row receipt__row--total"><span>Total</span><span>${formatCurrency(state.service.price, state.business?.currency)}</span></div>
  `;
}

els.payButton.addEventListener("click", async () => {
  showAlert(els.summaryError, "");
  setPaying(true);

  try {
    const appointment = await apiRequest("/api/appointments", {
      method: "POST",
      body: {
        businessId: state.business.id,
        serviceId: state.service.id,
        date: state.date,
        startTime: state.slot.startTime,
        ...state.customer,
      },
    });

    const payment = await apiRequest("/api/payments/create", {
      method: "POST",
      body: { entityType: "APPOINTMENT", entityId: appointment.id },
    });

    window.location.href = payment.paymentUrl;
  } catch (error) {
    setPaying(false);
    if (error instanceof ApiError && error.code === "AVAILABILITY_ERROR") {
      showAlert(els.summaryError, `${error.message} Elige otro horario para continuar.`);
      await loadAvailability();
      return;
    }
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

// ---------- utils ----------

function errorMessage(error) {
  return error instanceof ApiError ? error.message : "No pudimos conectar con el servidor. Intenta de nuevo.";
}

// ---------- init ----------

async function init() {
  try {
    state.business = await apiRequest(`/api/business/${state.negocioSlug}`);
    els.brandName.textContent = state.business.name;
    document.title = `Reservar — ${state.business.name}`;

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
