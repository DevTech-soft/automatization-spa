"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { SectionCard } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, useSession } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

/**
 * Seguridad de la cuenta propia: cambio de contraseña y verificación en dos
 * pasos (TOTP) con el plugin `twoFactor` de Better Auth. La usan el portal del
 * negocio y el operador; todo va por el proxy `/api/auth/*`, así que no hay
 * endpoints propios del backend para esto.
 *
 * Si alguien pierde el teléfono y los códigos de respaldo, el operador le quita
 * el 2FA desde la pestaña Usuarios del negocio.
 */
export function AccountSecurity({ issuer }: { issuer: string }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <ChangePasswordCard />
      <TwoFactorCard issuer={issuer} />
    </div>
  );
}

type Status = { ok: true; message: string } | { ok: false; error: string } | null;

function StatusMessage({ status }: { status: Status }) {
  if (!status) return null;
  return status.ok ? (
    <Callout tone="success">{status.message}</Callout>
  ) : (
    <Callout tone="danger">{status.error}</Callout>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="text-xs text-[var(--color-fg-muted)]">{hint}</p> : null}
    </div>
  );
}

// ── Contraseña ─────────────────────────────────────────────────────────────

const MIN_PASSWORD = 12;

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (next.length < MIN_PASSWORD) {
      setStatus({ ok: false, error: `La contraseña nueva debe tener al menos ${MIN_PASSWORD} caracteres.` });
      return;
    }
    if (next !== confirm) {
      setStatus({ ok: false, error: "La confirmación no coincide con la contraseña nueva." });
      return;
    }
    if (next === current) {
      setStatus({ ok: false, error: "La contraseña nueva tiene que ser distinta de la actual." });
      return;
    }

    setBusy(true);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: revokeOthers,
    });
    setBusy(false);

    if (error) {
      setStatus({ ok: false, error: authErrorMessage(error, "No se pudo cambiar la contraseña.") });
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setStatus({
      ok: true,
      message: revokeOthers
        ? "Contraseña cambiada. Las demás sesiones abiertas se cerraron."
        : "Contraseña cambiada.",
    });
  }

  return (
    <SectionCard
      title="Contraseña"
      description="Si entraste con una contraseña temporal, cámbiala por una que solo tú conozcas."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <PasswordField
          id="current-password"
          label="Contraseña actual"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <PasswordField
          id="new-password"
          label="Contraseña nueva"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          hint={`Mínimo ${MIN_PASSWORD} caracteres. Una frase larga es más fácil de recordar y más segura.`}
        />
        <PasswordField
          id="confirm-password"
          label="Repite la contraseña nueva"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={revokeOthers}
            onChange={(e) => setRevokeOthers(e.target.checked)}
            className="size-4"
          />
          Cerrar sesión en los demás dispositivos
        </label>
        <StatusMessage status={status} />
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? "Guardando…" : "Cambiar contraseña"}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

// ── Verificación en dos pasos ──────────────────────────────────────────────

type TwoFactorStep =
  | { kind: "idle" }
  | { kind: "confirm-password"; purpose: "enable" | "disable" | "backup-codes" }
  | { kind: "setup"; totpURI: string; backupCodes: string[] }
  | { kind: "codes"; backupCodes: string[] };

/** `issuer`: el nombre con que la cuenta aparece en la app del teléfono. */
function TwoFactorCard({ issuer }: { issuer: string }) {
  const { data: session, isPending } = useSession();
  const enabled = Boolean(session?.user.twoFactorEnabled);
  const [step, setStep] = useState<TwoFactorStep>({ kind: "idle" });
  const [status, setStatus] = useState<Status>(null);

  function start(purpose: "enable" | "disable" | "backup-codes") {
    setStatus(null);
    setStep({ kind: "confirm-password", purpose });
  }

  async function onPassword(purpose: "enable" | "disable" | "backup-codes", password: string): Promise<string | null> {
    if (purpose === "enable") {
      const { data, error } = await authClient.twoFactor.enable({ password, method: "totp", issuer });
      if (error || !data || !("totpURI" in data)) return authErrorMessage(error, "No se pudo iniciar la activación.");
      setStep({ kind: "setup", totpURI: data.totpURI, backupCodes: data.backupCodes });
      return null;
    }
    if (purpose === "disable") {
      const { error } = await authClient.twoFactor.disable({ password });
      if (error) return authErrorMessage(error, "No se pudo desactivar.");
      setStep({ kind: "idle" });
      setStatus({ ok: true, message: "Verificación en dos pasos desactivada." });
      return null;
    }
    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
    if (error || !data) return authErrorMessage(error, "No se pudieron generar los códigos.");
    setStep({ kind: "codes", backupCodes: data.backupCodes });
    return null;
  }

  return (
    <SectionCard
      title={
        <span className="flex flex-wrap items-center gap-2">
          Verificación en dos pasos
          {isPending ? null : enabled ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-success-soft)] px-2 py-0.5 text-xs font-medium text-[var(--color-success)]">
              <ShieldCheck className="size-3.5" /> Activa
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-grid)] px-2 py-0.5 text-xs font-medium text-[var(--color-fg-muted)]">
              <ShieldOff className="size-3.5" /> Inactiva
            </span>
          )}
        </span>
      }
      description="Además de la contraseña, al entrar se pide un código de 6 dígitos de una app en tu teléfono (Google Authenticator, Microsoft Authenticator, Authy…)."
      contentClassName="flex flex-col gap-4"
    >
      {step.kind === "confirm-password" ? (
        <ConfirmPassword
          purpose={step.purpose}
          onSubmit={(password) => onPassword(step.purpose, password)}
          onCancel={() => setStep({ kind: "idle" })}
        />
      ) : step.kind === "setup" ? (
        <SetupTotp
          totpURI={step.totpURI}
          backupCodes={step.backupCodes}
          onDone={() => {
            setStep({ kind: "idle" });
            setStatus({ ok: true, message: "Listo: desde el próximo ingreso se te pedirá el código." });
          }}
          onCancel={() => setStep({ kind: "idle" })}
        />
      ) : step.kind === "codes" ? (
        <div className="flex flex-col gap-4">
          <BackupCodes codes={step.backupCodes} />
          <p className="text-sm text-[var(--color-fg-muted)]">Los códigos anteriores dejaron de servir.</p>
          <div>
            <Button variant="outline" onClick={() => setStep({ kind: "idle" })}>
              Ya los guardé
            </Button>
          </div>
        </div>
      ) : isPending ? (
        <p className="text-sm text-[var(--color-fg-muted)]">Cargando…</p>
      ) : enabled ? (
        <>
          <StatusMessage status={status} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => start("backup-codes")}>
              <KeyRound className="size-4" />
              Nuevos códigos de respaldo
            </Button>
            <Button variant="ghost" className="text-[var(--color-danger)]" onClick={() => start("disable")}>
              Desactivar
            </Button>
          </div>
        </>
      ) : (
        <>
          <StatusMessage status={status} />
          <div>
            <Button onClick={() => start("enable")}>
              <ShieldCheck className="size-4" />
              Activar verificación en dos pasos
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

const CONFIRM_COPY = {
  enable: { intro: "Confirma tu contraseña para empezar.", action: "Continuar" },
  disable: {
    intro: "Sin el segundo paso, cualquiera con tu contraseña puede entrar. Confirma tu contraseña para desactivarlo.",
    action: "Desactivar",
  },
  "backup-codes": {
    intro: "Se generan 10 códigos nuevos y los anteriores dejan de servir. Confirma tu contraseña.",
    action: "Generar códigos",
  },
} as const;

function ConfirmPassword({
  purpose,
  onSubmit,
  onCancel,
}: {
  purpose: keyof typeof CONFIRM_COPY;
  onSubmit: (password: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = CONFIRM_COPY[purpose];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await onSubmit(password);
    setBusy(false);
    if (result) setError(result);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-[var(--color-fg-muted)]">{copy.intro}</p>
      <PasswordField
        id="2fa-password"
        label="Contraseña"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <div className="flex gap-2">
        <Button type="submit" variant={purpose === "disable" ? "danger" : "primary"} disabled={busy || !password}>
          {busy ? "Verificando…" : copy.action}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** El secreto en base32 que va dentro del `otpauth://`, para escribirlo a mano. */
function secretFromUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

function SetupTotp({
  totpURI,
  backupCodes,
  onDone,
  onCancel,
}: {
  totpURI: string;
  backupCodes: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secret = secretFromUri(totpURI);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(totpURI, { margin: 1, width: 192 })
      .then((url) => active && setQr(url))
      .catch(() => active && setQr(null));
    return () => {
      active = false;
    };
  }, [totpURI]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code: code.trim() });
    setBusy(false);
    if (verifyError) {
      setError(authErrorMessage(verifyError, "No se pudo verificar el código."));
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-col gap-5">
        <SetupStep n={1} title="Escanea el código con la app del teléfono">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-48 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white p-2">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="Código QR para la app de autenticación" className="size-full" />
              ) : (
                <span className="text-xs text-neutral-500">Generando…</span>
              )}
            </div>
            {secret ? (
              <div className="flex min-w-0 flex-col gap-1 text-sm">
                <span className="text-[var(--color-fg-muted)]">¿No puedes escanear? Escribe esta clave:</span>
                <code className="break-all rounded-md bg-[var(--color-surface)] px-2 py-1 font-mono text-xs">
                  {secret}
                </code>
              </div>
            ) : null}
          </div>
        </SetupStep>

        <SetupStep n={2} title="Guarda los códigos de respaldo">
          <p className="text-sm text-[var(--color-fg-muted)]">
            Cada uno sirve una vez para entrar si pierdes el teléfono. No se vuelven a mostrar.
          </p>
          <BackupCodes codes={backupCodes} />
        </SetupStep>

        <SetupStep n={3} title="Escribe el código que muestra la app">
          <form onSubmit={verify} className="flex flex-col gap-3">
            <Input
              aria-label="Código de 6 dígitos"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="max-w-40 font-mono tracking-[0.3em]"
            />
            {error ? <Callout tone="danger">{error}</Callout> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || code.length !== 6}>
                {busy ? "Verificando…" : "Activar"}
              </Button>
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancelar
              </Button>
            </div>
          </form>
        </SetupStep>
      </ol>
    </div>
  );
}

function SetupStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-semibold text-[var(--color-primary)]">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const blob = new Blob([`Códigos de respaldo (cada uno sirve una vez)\n\n${text}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "codigos-de-respaldo.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-2 rounded-lg bg-[var(--color-surface)] p-3 font-mono text-sm sm:grid-cols-3">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copiados" : "Copiar"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download className="size-4" />
          Descargar
        </Button>
      </div>
    </div>
  );
}
