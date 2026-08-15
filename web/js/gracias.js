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

function renderConfirmed(details) {
  render({
    mode: "success",
    status: "Reserva confirmada",
    title: "¡Todo listo!",
    bodyHtml: `
      <p>Tu pago fue recibido y tu cita quedó confirmada.</p>
      <p><strong>${escapeHtml(details.serviceName)}</strong><br />
      ${formatDateLong(details.date)}<br />
      ${details.startTime} – ${details.endTime}<br />
      ${formatCurrency(details.price, "COP")}</p>
      <p class="confirm-code">${escapeHtml(details.appointmentCode)}</p>
    `,
  });
}

function renderExpiredOrCancelled(details) {
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

function renderStillProcessing(details) {
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

function renderNotFound() {
  render({
    mode: "error",
    status: "No encontrada",
    title: "No encontramos esa reserva",
    bodyHtml: '<p>Verifica el enlace o <a href="/reservar">haz una nueva reserva</a>.</p>',
  });
}

function renderNoReference() {
  render({
    mode: "success",
    status: "Gracias",
    title: "¡Gracias por tu visita!",
    bodyHtml: '<p><a href="/reservar">Reservar una cita</a></p>',
  });
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

async function poll(reference, attempt) {
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
      renderNotFound();
      return;
    }
    if (attempt >= MAX_ATTEMPTS) {
      renderStillProcessing({ appointmentCode: reference });
      return;
    }
    setTimeout(() => poll(reference, attempt + 1), POLL_INTERVAL_MS);
    return;
  }

  if (details.status === "CONFIRMED" || details.status === "COMPLETED") {
    renderConfirmed(details);
    return;
  }

  if (details.status === "EXPIRED" || details.status === "CANCELLED") {
    renderExpiredOrCancelled(details);
    return;
  }

  if (attempt >= MAX_ATTEMPTS) {
    renderStillProcessing(details);
    return;
  }

  setTimeout(() => poll(reference, attempt + 1), POLL_INTERVAL_MS);
}

const reference = new URLSearchParams(location.search).get("ref");
if (reference) {
  poll(reference, 1);
} else {
  renderNoReference();
}
