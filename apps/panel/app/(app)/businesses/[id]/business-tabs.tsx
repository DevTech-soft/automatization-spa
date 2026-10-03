"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { segment: "", label: "Datos" },
  { segment: "branding", label: "Marca" },
  { segment: "onboarding", label: "Onboarding" },
  { segment: "catalog", label: "Catálogo" },
  { segment: "subscription", label: "Suscripción" },
  { segment: "integrations", label: "Integraciones" },
  { segment: "activity", label: "Actividad" },
  { segment: "conversations", label: "Conversaciones" },
  { segment: "usage", label: "Consumo" },
  { segment: "contacts", label: "Contactos" },
  { segment: "users", label: "Usuarios" },
];

export function BusinessTabs({ businessId }: { businessId: string }) {
  const pathname = usePathname();
  const base = `/businesses/${businessId}`;
  const current = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, "") : "";

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] p-1 shadow-[var(--shadow-card)]">
      {TABS.map((tab) => {
        const active = current === tab.segment;
        return (
          <Link
            key={tab.segment || "root"}
            href={tab.segment ? `${base}/${tab.segment}` : base}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-[var(--color-primary-soft)] font-medium text-[var(--color-primary)]"
                : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
