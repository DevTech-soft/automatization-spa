import { redirect } from "next/navigation";
import Link from "next/link";
import { getOperator } from "@/lib/backend";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const operator = await getOperator();
  if (!operator) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-background)] px-6">
        <Link href="/dashboard" className="text-sm font-semibold">
          Panel de operador
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--color-fg-muted)]">{operator.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 bg-[var(--color-surface)] p-6">{children}</main>
    </div>
  );
}
