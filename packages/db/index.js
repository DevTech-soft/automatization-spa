// @spa/db — punto único de acceso al cliente y a los tipos de Prisma.
//
// El backend (dueño de la conexión) crea su instancia configurada de
// `PrismaClient` en apps/backend/src/db/prisma.ts; el resto del monorepo importa
// desde aquí para no depender de `@prisma/client` directamente (ver
// docs/PANEL-OPERADOR.md D9/D10). El schema y las migraciones viven en
// packages/db/prisma/.
export * from "@prisma/client";
