import Link from "next/link";
import { CalendarClock, CreditCard, Receipt } from "lucide-react";
import type {
  OperatorInvoiceListItem,
  OperatorPaymentListItem,
  SubscriptionPlanDto,
  UpsertSubscriptionInput,
} from "@spa/shared";
import { InvoiceStatusBadge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { SectionCard } from "@/components/ui/card";
import { Table, TD, TH, THead, TR, EmptyRow } from "@/components/ui/table";
import { Stat } from "@/components/ui/stat";
import { adminGet } from "@/lib/backend";
import { formatDate, formatDaysRemaining, formatMoney } from "@/lib/format";
import { SubscriptionForm } from "./subscription-form";
import { PaymentForm } from "./payment-form";
import { EmitInvoiceButton } from "./emit-invoice-button";

/**
 * Suscripción y cartera de un cliente (docs/PANEL-OPERADOR.md §6.4/§6.5): el
 * plan que paga, hasta cuándo está al día, lo que debe y lo que ya pagó.
 */

interface BillingSummary {
  plan: SubscriptionPlanDto | null;
  outstanding: OperatorInvoiceListItem[];
  outstandingTotal: number;
  invoices: OperatorInvoiceListItem[];
  payments: OperatorPaymentListItem[];
}

export default async function SubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [subscription, billing] = await Promise.all([
    adminGet<{ plan: SubscriptionPlanDto | null; suggested: UpsertSubscriptionInput | null }>(
      `/admin/businesses/${id}/subscription`,
    ),
    adminGet<BillingSummary>(`/admin/businesses/${id}/billing`),
  ]);

  const plan = subscription.plan;
  const currency = plan?.currency ?? "COP";

  return (
    <div className="flex flex-col gap-6">
      {plan ? (
        <section className="grid gap-4 sm:grid-cols-3">
          <Stat
            icon={<CreditCard />}
            label="Plan"
            value={formatMoney(plan.price, plan.currency)}
            hint={`${plan.name} · ${plan.cycle === "MONTHLY" ? "cada 30 días" : "anual"}`}
          />
          <Stat
            icon={<CalendarClock />}
            label="Vigente hasta"
            value={formatDate(plan.validUntil)}
            hint={`${formatDaysRemaining(plan.daysRemaining)} · ${plan.graceDays} días de gracia`}
            tone={plan.graceExpired ? "danger" : plan.expired ? "warning" : "default"}
          />
          <Stat
            icon={<Receipt />}
            label="Pendiente de cobro"
            value={formatMoney(billing.outstandingTotal, currency)}
            hint={`${billing.outstanding.length} cuenta(s) sin pagar`}
            tone={billing.outstandingTotal > 0 ? "warning" : "success"}
          />
        </section>
      ) : (
        <Callout tone="warning" title="Este negocio todavía no tiene plan">
          Sin plan no se le puede emitir una cuenta de cobro ni entra en el ciclo de facturación.
        </Callout>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <SectionCard
          title="Plan"
          description={plan ? "Lo que paga y hasta cuándo está al día." : "Prellenado con los valores sugeridos."}
        >
          <SubscriptionForm businessId={id} plan={plan} suggested={subscription.suggested} />
        </SectionCard>

        <SectionCard
          title="Registrar un pago"
          description="Extiende la vigencia del plan y, si el negocio estaba en mora o suspendido, lo reactiva."
        >
          <PaymentForm businessId={id} plan={plan} outstanding={billing.outstanding} />
        </SectionCard>
      </div>

      <SectionCard
        title="Cuentas de cobro"
        description="El job diario emite la del próximo período 5 días antes del vencimiento."
        actions={plan ? <EmitInvoiceButton businessId={id} /> : null}
        flush
      >
        <Table flush>
          <THead>
            <tr>
              <TH>Número</TH>
              <TH>Emitida</TH>
              <TH>Vence</TH>
              <TH>Estado</TH>
              <TH className="text-right">Total</TH>
            </tr>
          </THead>
          <tbody>
            {billing.invoices.length === 0 ? (
              <EmptyRow colSpan={5}>Sin cuentas de cobro emitidas.</EmptyRow>
            ) : (
              billing.invoices.map((invoice) => (
                <TR key={invoice.id}>
                  <TD>
                    <Link
                      href={`/billing/${invoice.id}`}
                      className="font-mono text-xs text-[var(--color-primary)] hover:underline"
                    >
                      {invoice.number}
                    </Link>
                  </TD>
                  <TD className="text-[var(--color-fg-muted)]">{formatDate(invoice.issuedAt)}</TD>
                  <TD>
                    {formatDate(invoice.dueAt)}
                    {invoice.daysOverdue > 0 ? (
                      <span className="block text-xs text-[var(--color-danger)]">
                        {invoice.daysOverdue} día(s) de atraso
                      </span>
                    ) : null}
                  </TD>
                  <TD>
                    <InvoiceStatusBadge status={invoice.status} />
                  </TD>
                  <TD className="text-right tabular-nums">
                    {formatMoney(invoice.total, invoice.currency)}
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </SectionCard>

      <SectionCard title="Pagos recibidos" flush>
        <Table flush>
          <THead>
            <tr>
              <TH>Fecha</TH>
              <TH>Método</TH>
              <TH>Salda</TH>
              <TH className="text-right">Monto</TH>
            </tr>
          </THead>
          <tbody>
            {billing.payments.length === 0 ? (
              <EmptyRow colSpan={4}>Sin pagos registrados.</EmptyRow>
            ) : (
              billing.payments.map((payment) => (
                <TR key={payment.id}>
                  <TD>{formatDate(payment.paidAt)}</TD>
                  <TD>
                    {payment.method}
                    {payment.reference ? (
                      <span className="block text-xs text-[var(--color-fg-muted)]">
                        Ref. {payment.reference}
                      </span>
                    ) : null}
                  </TD>
                  <TD className="font-mono text-xs text-[var(--color-fg-muted)]">
                    {payment.invoiceNumbers.length > 0 ? payment.invoiceNumbers.join(", ") : "—"}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {formatMoney(payment.amount, payment.currency)}
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </SectionCard>
    </div>
  );
}
