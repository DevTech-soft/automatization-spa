/**
 * Restablece la contraseña de un usuario `operator` del panel (no hay flujo de
 * "olvidé mi contraseña": sin correo transaccional, se hace a mano).
 *
 * Uso:
 *   pnpm --filter @spa/backend script:reset-operator-password <email> [password]
 *
 * Sin `password` genera una de 16 caracteres y la imprime una vez. Cierra todas
 * las sesiones abiertas del operador. Solo toca usuarios con `role = operator`:
 * las cuentas del portal de cada negocio se restablecen desde el panel.
 *
 * Requiere `BETTER_AUTH_SECRET` + `DATABASE_URL` en el entorno.
 */
import { generateTemporaryPassword, resetCredentialPassword } from "../src/auth/users.js";
import { prisma } from "../src/db/prisma.js";

async function main(): Promise<void> {
  const email = process.argv[2]?.toLowerCase();
  const given = process.argv[3];

  if (!email) {
    throw new Error("Uso: script:reset-operator-password <email> [password]");
  }
  if (given !== undefined && given.length < 12) {
    throw new Error("La contraseña debe tener al menos 12 caracteres.");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`No existe un usuario con ${email}.`);
  }
  if (user.role !== "operator") {
    throw new Error(`${email} no es operador. Las cuentas del portal se restablecen desde el panel.`);
  }

  const password = given ?? generateTemporaryPassword();
  await resetCredentialPassword(user.id, password);

  console.log(`Contraseña restablecida para ${email}. Sesiones abiertas cerradas.`);
  if (!given) {
    console.log(`Nueva contraseña (se muestra una sola vez): ${password}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
