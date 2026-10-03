import { AccountSecurity } from "@/components/account-security";
import { PageHeader } from "@/components/page-header";

/** Contraseña y verificación en dos pasos de la cuenta propia (operador). */
export default function AccountPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Seguridad de la cuenta" description="Tu contraseña y la verificación en dos pasos." />
      <AccountSecurity issuer="Panel de operador" />
    </div>
  );
}
