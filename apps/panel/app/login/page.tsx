"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await signIn.email({ email, password });

    setLoading(false);
    if (signInError) {
      setError(
        signInError.message ??
          "No pudimos iniciar sesión. Revisa el correo y la contraseña.",
      );
      return;
    }
    // `/` reparte por rol (operador → panel, cliente → portal).
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="grid min-h-full bg-[var(--color-background)] lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[var(--color-primary)] p-12 text-[var(--color-primary-fg)] lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-32 -left-16 size-80 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-white/20 text-lg font-bold">P</span>
          <span className="text-lg font-semibold">Panel de reservas</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">La agenda, los pagos y las conversaciones del negocio, en un solo lugar.</h2>
          <p className="mt-4 text-sm opacity-80">
            Citas del bot y la web, cobros con Wompi y el historial de cada clienta, al día.
          </p>
        </div>
        <p className="relative text-xs opacity-70">Panel de operador y portal de clientes</p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Entra con el correo y la contraseña que te dieron.
          </p>
          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={loading} size="lg" className="mt-2">
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
