"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { segment: "", label: "Datos" },
  { segment: "branding", label: "Marca" },
  { segment: "onboarding", label: "Onboarding" },
];

export function BusinessTabs({ businessId }: { businessId: string }) {
  const pathname = usePathname();
  const base = `/businesses/${businessId}`;
  const current = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, "") : "";

  return (
    <nav className="flex gap-1 border-b border-[var(--color-border)]">
      {TABS.map((tab) => {
        const active = current === tab.segment;
        return (
          <Link
            key={tab.segment || "root"}
            href={tab.segment ? `${base}/${tab.segment}` : base}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-[var(--color-primary)] font-medium text-[var(--color-fg)]"
                : "border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
