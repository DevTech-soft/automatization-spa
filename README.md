# Spa MVP — Reservas, WhatsApp, Pagos y Gift Cards

MVP de reservas para spas/centros de belleza: reservas por web y WhatsApp, pagos con
webhook verificado, Gift Cards digitales y sincronización a Google Sheets como vista
administrativa. Ver `docs/ARCHITECTURE.md` para las decisiones de diseño.

Estado actual: **MVP completo y en producción**, desplegado en Railway con
autodeploy desde GitHub: https://spa-mvp-production.up.railway.app
(`/health` responde `ok`). Los webhooks de WhatsApp y Wompi están
registrados y probados con un pago y un mensaje reales — ver
`docs/TESTING.md` y `docs/DEPLOYMENT.md` para el detalle completo.

## Estructura del monorepo

Repo gestionado con **pnpm workspaces + Turborepo** (ver `docs/PANEL-OPERADOR.md` §8):

```
apps/
  backend/   API Fastify (webhooks, agente, pagos, gift cards, jobs) — @spa/backend
  panel/     (pendiente F3) panel de operador + portal de cliente en Next.js
packages/
  db/        schema Prisma, migraciones y tipos de datos compartidos — @spa/db
```

El backend es el único con acceso a Postgres; importa el cliente y los tipos de
Prisma desde `@spa/db` (que envuelve `@prisma/client`). El schema y las
migraciones viven en `packages/db/prisma/`.

## Stack

- Node.js 22+, TypeScript estricto, Fastify
- PostgreSQL vía Supabase, Prisma ORM
- Backend como único orquestador: webhooks de WhatsApp/pagos y sincronización
  con Google Sheets se llaman directo desde el backend, sin n8n (ver "Rol de
  n8n" en `docs/ARCHITECTURE.md`); los jobs periódicos (recordatorios,
  limpieza de reservas vencidas) corren con `node-cron` in-process
- Frontend estático (HTML/CSS/JS vanilla, sin build step)

## Requisitos previos

- Node.js >= 22
- pnpm (via `corepack enable`; la versión está fijada en `packageManager`)
- Un proyecto de [Supabase](https://supabase.com) (para `DATABASE_URL`, `DIRECT_URL` y las
  llaves de API)

## Puesta en marcha desde cero

1. Instalar dependencias (desde la raíz del monorepo):

   ```bash
   pnpm install
   ```

2. Copiar el archivo de variables de entorno y completarlo con los datos de tu
   proyecto de Supabase:

   ```bash
   cp apps/backend/.env.example apps/backend/.env
   ```

   Como mínimo, para esta fase necesitas rellenar: `DATABASE_URL`, `DIRECT_URL`,
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`. Las
   variables de WhatsApp, pagos y Google Sheets se completan en fases posteriores.

3. Generar el cliente de Prisma y aplicar las migraciones:

   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

   `db:migrate` también ejecuta el seed automáticamente (`prisma.seed` en
   `packages/db/package.json`) y crea el negocio de prueba **Demo Spa** con 5
   servicios y horarios de lunes a sábado. Para volver a correr el seed:

   ```bash
   pnpm db:seed
   ```

4. Levantar el servidor en modo desarrollo:

   ```bash
   pnpm dev
   ```

5. Verificar que responde:

   ```bash
   curl http://localhost:3000/health
   # {"status":"ok","db":"ok"}
   ```

## Scripts disponibles (raíz)

| Script | Descripción |
|---|---|
| `pnpm dev` | Backend en modo watch (vía Turborepo) |
| `pnpm build` | Compila todos los paquetes |
| `pnpm typecheck` | Chequeo de tipos sin emitir archivos |
| `pnpm lint` / `lint:fix` | ESLint sobre todo el repo |
| `pnpm format` | Prettier |
| `pnpm test` | Suite de tests (Vitest) |
| `pnpm db:generate` | Genera el cliente de Prisma |
| `pnpm db:migrate` | Crea/aplica migraciones en desarrollo |
| `pnpm db:deploy` | Aplica migraciones pendientes (producción) |
| `pnpm db:seed` | Reseed de datos de "Demo Spa" |
| `pnpm db:studio` | UI de Prisma para explorar la base de datos |

## Docker (opcional)

```bash
docker compose up
```

Requiere un `.env` ya completado; el contenedor se conecta al Supabase configurado
en `DATABASE_URL` (no se levanta Postgres local, ver `docs/ARCHITECTURE.md`).

## Estructura del proyecto

```
apps/backend/
  src/
    config/         validación de env vars (zod)
    controllers/     handlers HTTP
    services/        lógica de negocio
    repositories/    acceso a datos (Prisma)
    routes/          definición de endpoints
    middlewares/      error handler, auth de staff, rate limit
    validators/      schemas zod de entrada
    integrations/     whatsapp/, payments/, google-sheets/, storage/, n8n/
    jobs/             scheduler in-process (node-cron: recordatorios, limpieza)
    errors/           errores tipados
    db/               instancia configurada de PrismaClient (usa @spa/db)
  web/                frontend estático (/reservar, /regalar, /gracias, /validar)
  tests/              unit/ e integration/
  .env                variables de entorno del backend
packages/db/
  index.js            re-export de @prisma/client (tipos + cliente)
  prisma/             schema, migraciones, seed
docs/                 documentación del proyecto
```
