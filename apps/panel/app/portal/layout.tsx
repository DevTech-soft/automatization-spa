import { redirect } from "next/navigation";
import Link from "next/link";
import { getOperator, getPortalUser } from "@/lib/backend";
import { SignOutButton } from "@/components/sign-out-button";
import { PortalNav } from "./portal-nav";
import { brandStyle } from "./brand";

/**
 * Portal de cliente / CRM (docs/PANEL-OPERADOR.md F7). Mismo deploy y mismo
 * login que el panel del operador; cambia la superficie: aquí todo lo que se ve
 * es del negocio de la sesión, que el backend resuelve desde la membresía.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalUser();
  if (!viewer) {
    redirect((await getOperator()) ? "/dashboard" : "/login");
  }

  const { business } = viewer;

  return (
    <div className="flex min-h-full flex-col" style={brandStyle(business.colorPrimary)}>
      <header className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/portal" className="flex min-w-0 items-center gap-2">
            {business.logoUrl ? (
              // Logo por URL pública (no hay carga de archivos todavía, §6.1): sin next/image
              // para no tener que declarar cada dominio en `images.remotePatterns`.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.logoUrl} alt="" className="size-7 rounded object-contain" />
            ) : null}
            <span className="truncate text-sm font-semibold">{business.name}</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-[var(--color-fg-muted)] sm:inline">{viewer.name}</span>
            <SignOutButton />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6">
          <PortalNav role={viewer.role} />
        </div>
      </header>

      {business.status === "SUSPENDED" ? (
        <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-center text-sm text-red-800">
          El servicio de este negocio está <strong>suspendido</strong>: el bot de WhatsApp y las reservas en
          línea están pausados. Comunícate con tu proveedor para reactivarlo.
        </div>
      ) : business.status === "PAST_DUE" ? (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-center text-sm text-amber-900">
          Tienes una cuenta de cobro vencida. Ponte al día para evitar la suspensión del servicio.
        </div>
      ) : null}

      <main className="flex-1 bg-[var(--color-surface)] px-6 py-6">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
