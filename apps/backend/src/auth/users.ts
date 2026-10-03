import { randomInt } from "node:crypto";
import type { UserRole } from "@spa/shared";
import { auth } from "./better-auth.js";

/**
 * Alta de usuarios con contraseña sin pasar por `/sign-up/email`, que está
 * cerrado (`disableSignUp`). Es lo mismo que hace `createUser` del plugin
 * `admin` de Better Auth: usuario + cuenta `credential` con el hash de la
 * librería, sin abrir sesión.
 */

/**
 * `createLocalAccountIssuer("credential")` de `@better-auth/core/db`, que no se
 * re-exporta desde `better-auth`. `updatePassword` del internal adapter filtra
 * por este valor exacto: si no coincide, el cambio de contraseña no encuentra la
 * cuenta.
 */
const CREDENTIAL_ISSUER = "local:credential";

export interface NewCredentialUser {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

export async function createCredentialUser(input: NewCredentialUser): Promise<{ id: string; email: string }> {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({
    email: input.email.toLowerCase(),
    name: input.name,
    emailVerified: false,
    role: input.role,
  }, { method: "admin" });
  const hash = await ctx.password.hash(input.password);
  await ctx.internalAdapter.linkAccount({
    providerId: "credential",
    issuer: CREDENTIAL_ISSUER,
    accountId: user.id,
    userId: user.id,
    password: hash,
  });
  return { id: user.id, email: user.email };
}

/** Cambia la contraseña y cierra todas las sesiones abiertas del usuario. */
export async function resetCredentialPassword(userId: string, password: string): Promise<void> {
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);
  if (await ctx.internalAdapter.findCredentialAccount(userId)) {
    await ctx.internalAdapter.updatePassword(userId, hash);
  } else {
    await ctx.internalAdapter.linkAccount({
      providerId: "credential",
      issuer: CREDENTIAL_ISSUER,
      accountId: userId,
      userId,
      password: hash,
    });
  }
  await ctx.internalAdapter.deleteUserSessions(userId);
}

export async function revokeUserSessions(userId: string): Promise<void> {
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUserSessions(userId);
}

/**
 * Contraseña temporal para entregarle al cliente por WhatsApp: 16 caracteres sin
 * los ambiguos (0/O, 1/l/I), ~94 bits. Supera el mínimo de 12 de Better Auth.
 */
export function generateTemporaryPassword(length = 16): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}
