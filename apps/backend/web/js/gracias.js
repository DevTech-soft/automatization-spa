import { apiRequest, ApiError, formatCurrency, formatDateLong } from "/js/api.js";

const MAX_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 3000;

const ICONS = {
  success: '<circle cx="32" cy="32" r="30" /><path d="M20 33 L28 41 L45 24" />',
  pending: '<circle cx="32" cy="32" r="30" /><path d="M32 16 L32 32 L43 39" />',
  error: '<circle cx="32" cy="32" r="30" /><path d="M22 22 L42 42 M42 22 L22 42" />',
};

const els = {
  card: document.getElementById("confirmCard"),
  icon: document.getElementById("confirmIcon"),
  status: document.getElementById("confirmStatus"),
  title: document.getElementById("confirmTitle"),
  body: document.getElementById("confirmBody"),
};

function render({ mode, status, title, bodyHtml }) {
  els.card.classList.remove("is-pending", "is-error");
  if (mode === "pending") els.card.classList.add("is-pending");
  if (mode === "error") els.card.classList.add("is-error");

  els.icon.innerHTML = ICONS[mode] ?? ICONS.pending;
  els.status.textContent = status;
  els.title.textContent = title;
  els.body.innerHTML = bodyHtml;
}

function renderPendingDots(message) {
  return `<p>${message}</p><p class="confirm-dots" aria-hidden="true"><span></span><span></span><span></span></p>`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function renderNotFound(backHref, backLabel) {
  render({
    mode: "error",
    status: "No encontrada",
    title: "No encontramos esa referencia",
    bodyHtml: `<p>Verifica el enlace o <a href="${backHref}">${backLabel}</a>.</p>`,
  });
}

// ---------- Reserva (por defecto) ----------

function renderAppointmentConfirmed(details) {
  const isDeposit = details.depositAmount != null && details.pendingBalance != null;
  const priceHtml = isDeposit
    ? `Precio: ${formatCurrency(details.price, "COP")}<br />
       Abono recibido: ${formatCurrency(details.depositAmount, "COP")}<br />
       Saldo a pagar en el local: <strong>${formatCurrency(details.pendingBalance, "COP")}</strong>`
    : formatCurrency(details.price, "COP");

  render({
    mode: "success",
    status: "Reserva confirmada",
    title: "¡Todo listo!",
    bodyHtml: `
      <p>${isDeposit ? "Tu abono fue recibido y tu cita quedó confirmada." : "Tu pago fue recibido y tu cita quedó confirmada."}</p>
      <p><strong>${escapeHtml(details.serviceName)}</strong><br />
      ${formatDateLong(details.date)}<br />
      ${details.startTime} – ${details.endTime}<br />
      ${priceHtml}</p>
      <p class="confirm-code">${escapeHtml(details.appointmentCode)}</p>
    `,
  });
}

function renderAppointmentExpiredOrCancelled(details) {
  const isExpired = details.status === "EXPIRED";
  render({
    mode: "error",
    status: isExpired ? "Reserva expirada" : "Reserva cancelada",
    title: isExpired ? "Tu horario ya no está disponible" : "Esta reserva fue cancelada",
    bodyHtml: `
      <p>${
        isExpired
          ? "El tiempo para completar el pago venció y el horario se liberó."
          : "Si crees que esto es un error, contáctanos."
      }</p>
      <p><a href="/reservar">Hacer una nueva reserva</a></p>
    `,
  });
}

function renderAppointmentStillProcessing(details) {
  render({
    mode: "pending",
    status: "Procesando pago",
    title: "Estamos confirmando tu pago",
    bodyHtml:
      renderPendingDots("Esto puede tardar unos minutos. No cierres esta página si acabas de pagar.") +
      `<p class="confirm-code">${escapeHtml(details.appointmentCode)}</p>
       <p><a href="/reservar">Volver al inicio</a></p>`,
  });
}

function renderNoAppointmentReference() {
  render({
    mode: "success",
    status: "Gracias",
    title: "¡Gracias por tu visita!",
    bodyHtml: '<p><a href="/reservar">Reservar una cita</a></p>',
  });
}

async function pollAppointment(reference, attempt) {
  render({
    mode: "pending",
    status: "Confirmando",
    title: "Un momento…",
    bodyHtml: renderPendingDots("Estamos verificando el estado de tu reserva."),
  });

  let details;
  try {
    details = await apiRequest(`/api/appointments/status?reference=${encodeURIComponent(reference)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      renderNotFound("/reservar", "haz una nueva reserva");
      return;
    }
    if (attempt >= MAX_ATTEMPTS) {
      renderAppointmentStillProcessing({ appointmentCode: reference });
      return;
    }
    setTimeout(() => pollAppointment(reference, attempt + 1), POLL_INTERVAL_MS);
    return;
  }

  if (details.status === "CONFIRMED" || details.status === "COMPLETED") {
    renderAppointmentConfirmed(details);
    return;
  }
  if (details.status === "EXPIRED" || details.status === "CANCELLED") {
    renderAppointmentExpiredOrCancelled(details);
    return;
  }
  if (attempt >= MAX_ATTEMPTS) {
    renderAppointmentStillProcessing(details);
    return;
  }
  setTimeout(() => pollAppointment(reference, attempt + 1), POLL_INTERVAL_MS);
}

// ---------- Gift Card (?type=gift) ----------

function renderGiftCardConfirmed(details) {
  render({
    mode: "success",
    status: "Gift Card lista",
    title: "¡Todo listo!",
    bodyHtml: `
      <p>Tu pago fue recibido. Te enviamos la Gift Card por WhatsApp.</p>
      <p><strong>${escapeHtml(details.serviceName)}</strong><br />
      Para: ${escapeHtml(details.recipientName)}<br />
      ${formatCurrency(details.amount, "COP")}</p>
      ${details.pdfUrl ? `<p><img src="${details.pdfUrl}" alt="Gift Card" style="max-width:100%;border-radius:12px;" /></p>` : ""}
      <p class="confirm-code">${escapeHtml(details.code)}</p>
    `,
  });
}

function renderGiftCardStillProcessing(code) {
  render({
    mode: "pending",
    status: "Procesando pago",
    title: "Estamos confirmando tu pago",
    bodyHtml:
      renderPendingDots("Esto puede tardar unos minutos. No cierres esta página si acabas de pagar.") +
      `<p class="confirm-code">${escapeHtml(code)}</p>
       <p><a href="/regalar">Volver al inicio</a></p>`,
  });
}

async function pollGiftCard(reference, attempt) {
  render({
    mode: "pending",
    status: "Confirmando",
    title: "Un momento…",
    bodyHtml: renderPendingDots("Estamos verificando el estado de tu Gift Card."),
  });

  let details;
  try {
    details = await apiRequest(`/api/gift-cards/status?reference=${encodeURIComponent(reference)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      renderNotFound("/regalar", "compra una nueva Gift Card");
      return;
    }
    if (attempt >= MAX_ATTEMPTS) {
      renderGiftCardStillProcessing(reference);
      return;
    }
    setTimeout(() => pollGiftCard(reference, attempt + 1), POLL_INTERVAL_MS);
    return;
  }

  if (details.status === "PAID" || details.status === "SENT" || details.status === "REDEEMED") {
    renderGiftCardConfirmed(details);
    return;
  }
  if (attempt >= MAX_ATTEMPTS) {
    renderGiftCardStillProcessing(details.code);
    return;
  }
  setTimeout(() => pollGiftCard(reference, attempt + 1), POLL_INTERVAL_MS);
}

function renderNoGiftCardReference() {
  render({
    mode: "success",
    status: "Gracias",
    title: "¡Gracias!",
    bodyHtml: '<p><a href="/regalar">Regalar una experiencia</a></p>',
  });
}

// ---------- entrada ----------

const params = new URLSearchParams(location.search);
const reference = params.get("ref");
const isGiftCard = params.get("type") === "gift";

if (!reference) {
  isGiftCard ? renderNoGiftCardReference() : renderNoAppointmentReference();
} else if (isGiftCard) {
  pollGiftCard(reference, 1);
} else {
  pollAppointment(reference, 1);
}
