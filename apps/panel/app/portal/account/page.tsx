import { AccountSecurity } from "@/components/account-security";
import { PageHeader } from "@/components/page-header";
import { requirePortalUser } from "@/lib/backend";

/** Contraseña y verificación en dos pasos de la cuenta propia (usuario del portal). */
export default async function AccountPage() {
  const viewer = await requirePortalUser();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Seguridad de la cuenta" description="Tu contraseña y la verificación en dos pasos." />
      <AccountSecurity issuer={viewer.business.name} />
    </div>
  );
}
