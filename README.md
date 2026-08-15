# Spa MVP — Reservas, WhatsApp, Pagos y Gift Cards

MVP de reservas para spas/centros de belleza: reservas por web y WhatsApp, pagos con
webhook verificado, Gift Cards digitales y sincronización a Google Sheets como vista
administrativa. Ver `docs/ARCHITECTURE.md` para las decisiones de diseño.

Estado actual: **Fase 1 — Foundation** (backend base + Prisma + seed + health check).
Las demás fases (disponibilidad, reservas, pagos, WhatsApp, Sheets, Gift Cards,
recordatorios, deployment) se van documentando en `docs/` a medida que se implementan.

## Stack

- Node.js 20+, TypeScript estricto, Fastify
- PostgreSQL vía Supabase, Prisma ORM
- n8n como orquestador de automatizaciones (cron, Sheets, WhatsApp)
- Frontend estático (HTML/CSS/JS vanilla, sin build step)

## Requisitos previos

- Node.js >= 20
- Un proyecto de [Supabase](https://supabase.com) (para `DATABASE_URL`, `DIRECT_URL` y las
  llaves de API)
- npm

## Puesta en marcha desde cero

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Copiar el archivo de variables de entorno y completarlo con los datos de tu
   proyecto de Supabase:

   ```bash
   cp .env.example .env
   ```

   Como mínimo, para esta fase necesitas rellenar: `DATABASE_URL`, `DIRECT_URL`,
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`. Las
   variables de WhatsApp, pagos y Google Sheets se completan en fases posteriores.

3. Generar el cliente de Prisma y aplicar las migraciones:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

   Esto también ejecuta el seed automáticamente (`prisma.seed` en `package.json`) y
   crea el negocio de prueba **Demo Spa** con 5 servicios y horarios de lunes a
   sábado. Para volver a correr el seed manualmente:

   ```bash
   npm run prisma:seed
   ```

4. Levantar el servidor en modo desarrollo:

   ```bash
   npm run dev
   ```

5. Verificar que responde:

   ```bash
   curl http://localhost:3000/health
   # {"status":"ok","db":"ok"}
   ```

## Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run dev` | Backend en modo watch |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Ejecuta el build compilado |
| `npm run typecheck` | Chequeo de tipos sin emitir archivos |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` | Prettier |
| `npm test` | Suite de tests (Vitest) |
| `npm run prisma:migrate` | Crea/aplica migraciones en desarrollo |
| `npm run prisma:seed` | Reseed de datos de "Demo Spa" |
| `npm run prisma:studio` | UI de Prisma para explorar la base de datos |

## Docker (opcional)

```bash
docker compose up
```

Requiere un `.env` ya completado; el contenedor se conecta al Supabase configurado
en `DATABASE_URL` (no se levanta Postgres local, ver `docs/ARCHITECTURE.md`).

## Estructura del proyecto

```
src/
  config/        validación de env vars (zod)
  controllers/    handlers HTTP
  services/       lógica de negocio
  repositories/   acceso a datos (Prisma)
  routes/         definición de endpoints
  middlewares/     error handler, auth de staff, rate limit
  validators/     schemas zod de entrada
  integrations/    whatsapp/, payments/, google-sheets/, storage/
  errors/          errores tipados
  db/              cliente Prisma
prisma/            schema, migraciones, seed
web/                frontend estático (/reservar, /regalar, /gracias, /validar)
n8n/workflows/       workflows de automatización
docs/                documentación del proyecto
tests/               unit/ e integration/
```
