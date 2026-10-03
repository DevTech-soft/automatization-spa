"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PortalRole } from "@spa/shared";
import { cn } from "@/lib/utils";

const NAV: Array<{ href: string; label: string; ownerOnly?: boolean }> = [
  { href: "/portal", label: "Hoy" },
  { href: "/portal/appointments", label: "Citas" },
  { href: "/portal/customers", label: "Clientas" },
  { href: "/portal/conversations", label: "Conversaciones" },
  { href: "/portal/metrics", label: "Métricas", ownerOnly: true },
  { href: "/portal/payments", label: "Pagos", ownerOnly: true },
  { href: "/portal/gift-cards", label: "Gift cards", ownerOnly: true },
];

/** El equipo no ve las secciones de plata; el backend igual las rechaza con 403. */
export function PortalNav({ role }: { role: PortalRole }) {
  const pathname = usePathname();

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {NAV.filter((item) => !item.ownerOnly || role === "owner").map((item) => {
        const active = item.href === "/portal" ? pathname === "/portal" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-[var(--color-primary)] font-medium text-[var(--color-fg)]"
                : "border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
