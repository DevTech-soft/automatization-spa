import type { FastifyInstance } from "fastify";
import {
  createInvoiceSchema,
  extendSubscriptionSchema,
  invoiceActionSchema,
  invoiceListQuerySchema,
  paginationQuerySchema,
  registerPaymentSchema,
  upsertSubscriptionSchema,
} from "@spa/shared";
import { z } from "zod";
import {
  applyInvoiceAction,
  createInvoice,
  generateInvoicePdf,
  generateReceiptPdf,
  getBusinessBillingSummary,
  getInvoice,
  listInvoices,
  listOutstandingInvoices,
  listPayments,
  registerPayment,
} from "../services/admin-billing.service.js";
import {
  extendSubscription,
  getSubscription,
  suggestedSubscription,
  upsertSubscription,
} from "../services/admin-subscription.service.js";
import { runBillingCycle } from "../services/billing-cycle.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * Suscripciones y cartera del operador (docs/PANEL-OPERADOR.md §6.4/§6.5, F5).
 * Se monta dentro del scope de `/admin/*`, así que hereda `requireOperatorSession`.
 */
export async function adminBillingRoutes(app: FastifyInstance): Promise<void> {
  // — Plan de suscripción por negocio —

  app.get("/admin/businesses/:id/subscription", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const plan = await getSubscription(id);
    // Sin plan, el panel prellena el formulario con los defaults (D8) en vez de
    // pedirle al operador que invente precio, ciclo y vigencia.
    return { data: { plan, suggested: plan ? null : suggestedSubscription() } };
  });

  app.put("/admin/businesses/:id/subscription", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = upsertSubscriptionSchema.parse(request.body);
    return { data: await upsertSubscription(id, body, request.operator!.userId) };
  });

  app.post("/admin/businesses/:id/subscription/extend", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = extendSubscriptionSchema.parse(request.body);
    return { data: await extendSubscription(id, body, request.operator!.userId) };
  });

  // — Cartera del negocio (resumen de su pestaña de suscripción) —

  app.get("/admin/businesses/:id/billing", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return { data: await getBusinessBillingSummary(id) };
  });

  app.get("/admin/businesses/:id/invoices/outstanding", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return { data: await listOutstandingInvoices(id) };
  });

  app.post("/admin/businesses/:id/invoices", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = createInvoiceSchema.parse(request.body ?? {});
    const invoice = await createInvoice(id, body, request.operator!.userId);
    reply.status(201);
    return { data: invoice };
  });

  app.post("/admin/businesses/:id/payments", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = registerPaymentSchema.parse(request.body);
    const result = await registerPayment(id, body, request.operator!.userId);
    reply.status(201);
    return { data: result };
  });

  // — Cartera global —

  app.get("/admin/invoices", async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    const filters = invoiceListQuerySchema.parse(request.query);
    return { data: await listInvoices(query, filters) };
  });

  app.get("/admin/invoices/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return { data: await getInvoice(id) };
  });

  app.post("/admin/invoices/:id/status", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = invoiceActionSchema.parse(request.body);
    return { data: await applyInvoiceAction(id, body, request.operator!.userId) };
  });

  app.post("/admin/invoices/:id/pdf", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return { data: { pdfUrl: await generateInvoicePdf(id, request.operator!.userId) } };
  });

  app.get("/admin/payments", async (request) => {
    const query = paginationQuerySchema.parse(request.query);
    const { businessId } = z.object({ businessId: z.string().uuid().optional() }).parse(request.query);
    return { data: await listPayments(query, { businessId }) };
  });

  app.post("/admin/payments/:id/pdf", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return { data: { pdfUrl: await generateReceiptPdf(id, request.operator!.userId) } };
  });

  /**
   * Corrida manual del ciclo de facturación. El scheduler la dispara a diario
   * (`/internal/jobs/billing-cycle`); esta versión es la que el operador puede
   * ejecutar desde el panel para ver el resultado al instante.
   */
  app.post("/admin/billing/run", async () => {
    return { data: await runBillingCycle() };
  });
}
