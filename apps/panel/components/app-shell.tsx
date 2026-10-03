"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  ShieldCheck,
  Sun,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { initials } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

/**
 * Marco común del panel (operador) y del portal (spa), con Able Pro como
 * referencia visual: menú lateral agrupado, colapsable a íconos en escritorio y
 * cajón en móvil; header fijo con modo oscuro y menú de usuario.
 *
 * Los íconos viajan por nombre (`icon: "calendar"`) porque un layout de
 * servidor no puede pasarle componentes a un componente de cliente.
 */

const ICONS = {
  dashboard: LayoutDashboard,
  today: Sun,
  businesses: Building2,
  billing: Wallet,
  audit: ScrollText,
  calendar: CalendarDays,
  users: Users,
  chats: MessagesSquare,
  metrics: BarChart3,
  payments: CreditCard,
  gift: Gift,
} as const;

export type NavIcon = keyof typeof ICONS;

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Activo solo en la ruta exacta (para la portada, que es prefijo de todo). */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const COLLAPSE_KEY = "panel-sidebar-collapsed";

export function AppShell({
  brand,
  nav,
  user,
  accountHref,
  banner,
  children,
}: {
  brand: { name: string; subtitle: string; href: string; logoUrl?: string | null };
  nav: NavGroup[];
  user: { name: string; email: string; roleLabel: string };
  /** Página de seguridad de la cuenta propia (contraseña y 2FA). */
  accountHref?: string;
  /** Aviso a lo ancho bajo el header (negocio suspendido, mora…). */
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // sin almacenamiento: arranca expandido
    }
  }, []);

  // Al navegar en móvil se cierra el cajón.
  useEffect(() => setMobileOpen(false), [pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, prev ? "0" : "1");
      } catch {
        // ignorar
      }
      return !prev;
    });
  }

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <div className="min-h-full">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-[var(--color-border)] bg-[var(--color-background)] transition-[transform,width] duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          collapsed && "lg:w-[76px]",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-5">
          <Link href={brand.href} className="flex min-w-0 items-center gap-3">
            {brand.logoUrl ? (
              // Logo por URL pública del negocio (pestaña Marca); sin next/image para
              // no declarar cada dominio en `images.remotePatterns`.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt="" className="size-9 shrink-0 rounded-lg object-contain" />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)] text-sm font-bold text-[var(--color-primary-fg)]">
                {brand.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className={cn("min-w-0", collapsed && "lg:hidden")}>
              <span className="block truncate text-sm font-semibold">{brand.name}</span>
              <span className="block truncate text-xs text-[var(--color-fg-muted)]">{brand.subtitle}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
            className="ml-auto text-[var(--color-fg-muted)] lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Principal">
          {nav.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              <p
                className={cn(
                  "px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]",
                  collapsed && "lg:sr-only",
                )}
              >
                {group.label}
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  const active = isActive(item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                          active
                            ? "bg-[var(--color-primary-soft)] font-medium text-[var(--color-primary)]"
                            : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]",
                          collapsed && "lg:justify-center lg:px-0",
                        )}
                      >
                        <Icon className="size-[18px] shrink-0" />
                        <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className={cn("flex min-h-full flex-col transition-[padding] duration-200", collapsed ? "lg:pl-[76px]" : "lg:pl-[260px]")}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-background)]/85 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            className="inline-flex size-9 items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
            className="hidden size-9 items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] lg:inline-flex"
          >
            {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          </button>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu user={user} accountHref={accountHref} />
          </div>
        </header>

        {banner}

        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

function UserMenu({
  user,
  accountHref,
}: {
  user: { name: string; email: string; roleLabel: string };
  accountHref?: string | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onSignOut() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-[var(--color-surface)]"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-semibold text-[var(--color-primary)]">
          {initials(user.name)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-40 truncate text-sm font-medium leading-tight">{user.name}</span>
          <span className="block text-xs leading-tight text-[var(--color-fg-muted)]">{user.roleLabel}</span>
        </span>
        <ChevronDown className="hidden size-4 text-[var(--color-fg-muted)] sm:block" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] shadow-lg"
        >
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-[var(--color-fg-muted)]">{user.email}</p>
          </div>
          {accountHref ? (
            <Link
              href={accountHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-[var(--color-surface)]"
            >
              <ShieldCheck className="size-4 text-[var(--color-fg-muted)]" />
              Seguridad de la cuenta
            </Link>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={onSignOut}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-[var(--color-danger)] hover:bg-[var(--color-surface)]"
          >
            <LogOut className="size-4" />
            Cerrar sesión
          </button>
        </div>
      ) : null}
    </div>
  );
}
