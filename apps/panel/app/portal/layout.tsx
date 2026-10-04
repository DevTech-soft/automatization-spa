import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getOperator, getPortalUser } from "@/lib/backend";
import { AppShell, type NavGroup } from "@/components/app-shell";
import { brandStyle } from "./brand";

/**
 * Portal de cliente / CRM (docs/PANEL-OPERADOR.md F7). Mismo deploy y mismo
 * login que el panel del operador; cambia la superficie: aquí todo lo que se ve
 * es del negocio de la sesión, que el backend resuelve desde la membresía. El
 * acento toma el color primario del negocio (pestaña Marca).
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalUser();
  if (!viewer) {
    redirect((await getOperator()) ? "/dashboard" : "/login");
  }

  const { business } = viewer;
  const owner = viewer.role === "owner";

  // El equipo no ve las secciones de plata ni el catálogo; el backend igual las rechaza con 403.
  const nav: NavGroup[] = [
    {
      label: "Operación",
      items: [
        { href: "/portal", label: "Hoy", icon: "today", exact: true },
        { href: "/portal/appointments", label: "Citas", icon: "calendar" },
        { href: "/portal/customers", label: "Clientas", icon: "users" },
        { href: "/portal/conversations", label: "Conversaciones", icon: "chats" },
      ],
    },
    ...(owner
      ? [
          {
            label: "Negocio",
            items: [
              { href: "/portal/catalog", label: "Servicios y horarios", icon: "catalog" as const },
              { href: "/portal/metrics", label: "Métricas", icon: "metrics" as const },
              { href: "/portal/payments", label: "Pagos", icon: "payments" as const },
              { href: "/portal/gift-cards", label: "Gift cards", icon: "gift" as const },
            ],
          },
        ]
      : []),
  ];

  const banner =
    business.status === "SUSPENDED" ? (
      <div className="flex items-center justify-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-danger-soft)] px-6 py-3 text-center text-sm text-[var(--color-danger)]">
        <AlertTriangle className="size-4 shrink-0" />
        <span>
          El servicio está <strong>suspendido</strong>: el bot de WhatsApp y las reservas en línea están pausados.
          Comunícate con tu proveedor para reactivarlo.
        </span>
      </div>
    ) : business.status === "PAST_DUE" ? (
      <div className="flex items-center justify-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-warning-soft)] px-6 py-3 text-center text-sm text-[var(--color-warning)]">
        <AlertTriangle className="size-4 shrink-0" />
        Tienes una cuenta de cobro vencida. Ponte al día para evitar la suspensión del servicio.
      </div>
    ) : null;

  return (
    <div className="min-h-full" style={brandStyle(business.colorPrimary)}>
      <AppShell
        brand={{ name: business.name, subtitle: "Portal del negocio", href: "/portal", logoUrl: business.logoUrl }}
        nav={nav}
        user={{ name: viewer.name, email: viewer.email, roleLabel: owner ? "Dueño(a)" : "Equipo" }}
        accountHref="/portal/account"
        banner={banner}
      >
        <div>{children}</div>
      </AppShell>
    </div>
  );
}
