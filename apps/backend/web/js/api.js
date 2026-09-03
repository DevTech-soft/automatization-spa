// Cliente HTTP minimo compartido por /reservar y /gracias. Sin build step
// (seccion 3), sin dependencias externas: fetch nativo + el formato de
// respuesta consistente que expone el backend (docs/API.md).

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Respuesta sin cuerpo (no debería pasar en estos endpoints).
  }

  if (!response.ok) {
    const error = payload && payload.error;
    throw new ApiError(
      (error && error.message) || "Ocurrió un error inesperado. Intenta de nuevo.",
      error && error.code,
      response.status,
    );
  }

  return payload ? payload.data : null;
}

export function formatCurrency(amount, currency) {
  const value = typeof amount === "string" ? Number(amount) : amount;
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: currency || "COP",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value} ${currency || ""}`.trim();
  }
}

export function formatDateLong(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeZone: "UTC" }).format(date);
}
