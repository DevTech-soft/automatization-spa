import { cn } from "@/lib/utils";

/** Dos iniciales del nombre ("?" si viene vacío). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Iniciales sobre el acento tenue, para listas de personas. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-sm font-semibold text-[var(--color-primary)]",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
