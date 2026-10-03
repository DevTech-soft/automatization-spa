"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Building2,
  ClipboardCheck,
  Contact,
  CreditCard,
  MessagesSquare,
  Palette,
  Plug,
  Sparkles,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { segment: "", icon: Building2, label: "Datos" },
  { segment: "branding", icon: Palette, label: "Marca" },
  { segment: "onboarding", icon: ClipboardCheck, label: "Onboarding" },
  { segment: "catalog", icon: Sparkles, label: "Catálogo" },
  { segment: "subscription", icon: CreditCard, label: "Suscripción" },
  { segment: "integrations", icon: Plug, label: "Integraciones" },
  { segment: "activity", icon: Activity, label: "Actividad" },
  { segment: "conversations", icon: MessagesSquare, label: "Conversaciones" },
  { segment: "usage", icon: BarChart3, label: "Consumo" },
  { segment: "contacts", icon: Contact, label: "Contactos" },
  { segment: "users", icon: UserCog, label: "Usuarios" },
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
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-[var(--color-primary-soft)] font-medium text-[var(--color-primary)]"
                : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]",
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
