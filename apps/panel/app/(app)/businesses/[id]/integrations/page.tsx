import type {
  EmbeddedSignupConfigDto,
  PaymentCredentialsDto,
  WhatsAppAccountDto,
  WhatsAppSignupSessionDto,
} from "@spa/shared";
import { SectionCard } from "@/components/ui/card";
import { adminGet } from "@/lib/backend";
import { WhatsAppSection } from "./whatsapp-section";
import { WompiForm } from "./wompi-form";

/**
 * Integraciones por-tenant de un cliente: su número de WhatsApp
 * (docs/PANEL-OPERADOR.md §7) y sus llaves de Wompi (§D3). Son las dos cosas
 * que dejaron de ser variables de entorno globales al pasar a multi-cliente (§3).
 */
export default async function IntegrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [accounts, credentials, signupConfig, signupSessions] = await Promise.all([
    adminGet<WhatsAppAccountDto[]>(`/admin/businesses/${id}/whatsapp`),
    adminGet<PaymentCredentialsDto>(`/admin/businesses/${id}/payment-credentials`),
    adminGet<EmbeddedSignupConfigDto>("/admin/whatsapp/embedded-signup"),
    adminGet<WhatsAppSignupSessionDto[]>(`/admin/businesses/${id}/whatsapp/signup-links`),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <WhatsAppSection
        businessId={id}
        accounts={accounts}
        signupConfig={signupConfig}
        signupSessions={signupSessions}
      />
      <SectionCard
        title="Pagos (Wompi)"
        description="Las llaves del comercio del cliente: su plata entra directo a su cuenta. Se guardan cifradas y nunca se vuelven a mostrar completas."
      >
        <WompiForm businessId={id} credentials={credentials} />
      </SectionCard>
    </div>
  );
}
