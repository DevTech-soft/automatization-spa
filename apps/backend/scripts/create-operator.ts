/**
 * Da de alta el usuario `operator` del panel (docs/PANEL-OPERADOR.md §9).
 * v1 tiene un solo operador; se crea a mano con este script — no hay signup
 * público.
 *
 * Uso:
 *   OPERATOR_EMAIL=... OPERATOR_PASSWORD=... \
 *     pnpm --filter @spa/backend script:create-operator
 *   # o pasando por argv:
 *   pnpm --filter @spa/backend script:create-operator <email> <password> [nombre]
 *
 * Requiere `BETTER_AUTH_SECRET` + `DATABASE_URL` en el entorno. La contraseña
 * debe tener 12+ caracteres. Si ya existe un `user` con ese correo pero sin
 * credenciales (estado a medias de una corrida previa), lo limpia y lo recrea.
 * El 2FA se activa después desde el panel.
 */
import { auth } from "../src/auth/better-auth.js";
import { prisma } from "../src/db/prisma.js";

async function main(): Promise<void> {
  const email = process.argv[2] ?? process.env.OPERATOR_EMAIL;
  const password = process.argv[3] ?? process.env.OPERATOR_PASSWORD;
  const name = process.argv[4] ?? process.env.OPERATOR_NAME ?? "Operador";

  if (!email || !password) {
    throw new Error("Faltan email y/o password (argv o OPERATOR_EMAIL/OPERATOR_PASSWORD).");
  }
  if (password.length < 12) {
    throw new Error("La contraseña debe tener al menos 12 caracteres.");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { accounts: true },
  });

  if (existing) {
    const hasCredential = existing.accounts.some((a) => a.providerId === "credential");
    if (hasCredential) {
      console.log(`Ya existe un operador con ${email} (${existing.id}). Nada que hacer.`);
      return;
    }
    console.log(`Usuario ${email} existe pero sin credenciales — se limpia y recrea.`);
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const result = await auth.api.signUpEmail({ body: { email, password, name } });
  console.log(`Operador creado: ${result.user.email} (${result.user.id}).`);
  console.log("Siguiente: inicia sesión en el panel y activa el 2FA.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
