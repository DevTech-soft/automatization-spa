/**
 * URL del backend Fastify (Railway). SERVER-ONLY — nunca se expone al browser:
 * el panel usa BFF (docs/PANEL-OPERADOR.md D12), el navegador solo habla con
 * el propio panel.
 */
export const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
