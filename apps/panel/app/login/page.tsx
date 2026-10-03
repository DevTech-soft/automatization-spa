"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, signIn } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Con 2FA activo, el login con contraseña no abre sesión: Better Auth responde
  // `twoFactorRedirect` y deja una cookie temporal (10 min) para el segundo paso.
  const [twoFactor, setTwoFactor] = useState(false);
  const [useBackup, setUseBackup] = useState(false);
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);

  function goHome() {
    // `/` reparte por rol (operador → panel, cliente → portal).
    router.replace("/");
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: signInError } = await signIn.email({ email, password });

    setLoading(false);
    if (signInError) {
      setError(authErrorMessage(signInError, "No pudimos iniciar sesión. Revisa el correo y la contraseña."));
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setTwoFactor(true);
      return;
    }
    goHome();
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmed = code.trim();
    const { error: verifyError } = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code: trimmed, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code: trimmed, trustDevice });

    setLoading(false);
    if (verifyError) {
      const message = authErrorMessage(verifyError, "No se pudo verificar el código.");
      setError(message);
      // La cookie del segundo paso venció o se agotaron los intentos: hay que
      // volver a la contraseña.
      if (verifyError.code === "INVALID_TWO_FACTOR_COOKIE" || verifyError.code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE") {
        restart(message);
      }
      return;
    }
    goHome();
  }

  function restart(message: string | null = null) {
    setTwoFactor(false);
    setUseBackup(false);
    setCode("");
    setPassword("");
    setError(message);
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
          {twoFactor ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Verificación en dos pasos</h1>
              <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                {useBackup
                  ? "Escribe uno de tus códigos de respaldo. Cada uno sirve una sola vez."
                  : "Abre la app de autenticación del teléfono y escribe el código de 6 dígitos."}
              </p>
              <form onSubmit={onVerify} className="mt-8 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="code">{useBackup ? "Código de respaldo" : "Código"}</Label>
                  <Input
                    id="code"
                    autoFocus
                    required
                    autoComplete="one-time-code"
                    inputMode={useBackup ? "text" : "numeric"}
                    maxLength={useBackup ? 32 : 6}
                    placeholder={useBackup ? "xxxxx-xxxxx" : "123456"}
                    value={code}
                    onChange={(e) => setCode(useBackup ? e.target.value : e.target.value.replace(/\D/g, ""))}
                    className="font-mono tracking-[0.2em]"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
                  <input
                    type="checkbox"
                    checked={trustDevice}
                    onChange={(e) => setTrustDevice(e.target.checked)}
                    className="size-4"
                  />
                  No volver a pedirlo en este dispositivo por 30 días
                </label>
                {error ? (
                  <p className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]" role="alert">
                    {error}
                  </p>
                ) : null}
                <Button type="submit" disabled={loading || (!useBackup && code.length !== 6)} size="lg" className="mt-2">
                  {loading ? "Verificando…" : "Verificar"}
                </Button>
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setUseBackup((v) => !v);
                      setCode("");
                      setError(null);
                    }}
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    {useBackup ? "Usar la app de autenticación" : "Usar un código de respaldo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => restart()}
                    className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                  >
                    Volver
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </section>
    </main>
  );
}
