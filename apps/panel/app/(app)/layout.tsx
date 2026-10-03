import { redirect } from "next/navigation";
import { getOperator, getPortalUser } from "@/lib/backend";
import { AppShell, type NavGroup } from "@/components/app-shell";

const NAV: NavGroup[] = [
  {
    label: "General",
    items: [{ href: "/dashboard", label: "Inicio", icon: "dashboard" }],
  },
  {
    label: "Clientes",
    items: [
      { href: "/businesses", label: "Negocios", icon: "businesses" },
      { href: "/billing", label: "Cartera", icon: "billing" },
    ],
  },
  {
    label: "Control",
    items: [{ href: "/audit", label: "Bitácora", icon: "audit" }],
  },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const operator = await getOperator();
  if (!operator) {
    // Un usuario de un spa tiene sesión pero no es operador: va a su portal.
    redirect((await getPortalUser()) ? "/portal" : "/login");
  }

  return (
    <AppShell
      brand={{ name: "Panel de operador", subtitle: "Gestión multi-cliente", href: "/dashboard" }}
      nav={NAV}
      user={{ name: operator.email.split("@")[0] ?? operator.email, email: operator.email, roleLabel: "Operador" }}
    >
      {children}
    </AppShell>
  );
}
