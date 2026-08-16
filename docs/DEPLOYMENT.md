# Deployment

Fase 11 del roadmap. Target: **Railway**, desplegando la imagen de
`Dockerfile` (single container: API + frontend estático + scheduler
in-process — sección 2/39, sin n8n, ver "Rol de n8n" en
`docs/ARCHITECTURE.md`). `railway.json` ya define el builder (`DOCKERFILE`),
el healthcheck (`/health`) y la política de reinicio.

Este documento asume que ya existe un proyecto de Supabase con las
migraciones aplicadas en desarrollo (Fase 1) — Railway aloja la API, no la
base de datos.

## Estado real (Fase 11)

Ya desplegado y verificado en vivo:

- Proyecto Railway `spa-mvp` (workspace `DevTech-soft`), servicio único
  (Dockerfile), apuntando al Supabase real del proyecto.
- Dominio: `https://spa-mvp-production.up.railway.app` — `/health` responde
  `200 {"status":"ok","db":"ok"}`, `/reservar` y los assets sirven `200`,
  `/api/business/demo-spa` devuelve el negocio real desde Supabase.
- Variables de entorno cargadas desde el `.env` local (todas las de
  `docs/ENVIRONMENT.md`, `NODE_ENV=production`, `PORT=3000` fijo — ver la nota
  de puerto más abajo, aprendida desplegando este mismo servicio).
- `/internal/jobs/*` confirmado rechazando requests sin token (`401`).
- **Autodeploy conectado**: el servicio está enganchado a
  `DevTech-soft/automatization-spa` rama `main`
  (`railway service source connect --repo ... --branch main`) — cada push a
  `main` redespliega solo. El primer deploy se hizo vía `railway up` (subir
  el directorio local) porque el `git push` desde el sandbox de esa sesión no
  tenía acceso SSH; una vez que el repo en GitHub tuvo el código al día, se
  conectó como source y no hace falta `railway up` de nuevo — solo `git
  push`. Para forzar un redeploy manual sin push nuevo: `railway redeploy
  --from-source`.

**Pendiente** (necesita acción tuya en paneles externos, sección 4): registrar
los webhooks de WhatsApp y Wompi con la URL real de arriba, y probar un pago y
un mensaje de WhatsApp reales end-to-end.

## 0. Verificado en Fase 11 (antes de desplegar)

Antes de escribir este documento se validó localmente, con Docker real
(`docker build` + `docker run --env-file .env` contra el Supabase real del
proyecto):

- La imagen compila limpia (`node:22-slim`, ver nota de Node más abajo).
- `npm run prisma:deploy` (parte del `CMD`) conecta al Supabase real y
  reporta "No pending migrations to apply" — las migraciones de desarrollo ya
  están sincronizadas.
- El servidor arranca, `/health` responde `{"status":"ok","db":"ok"}`,
  `/reservar` y los assets de `/css`/`/js` sirven `200`.
- Puppeteer/Chromium (Gift Cards, Fase 8) lanza y toma un screenshot
  correctamente dentro del contenedor — el `Dockerfile` traía un TODO sin
  resolver desde la Fase 0 (`node:20-slim` no tiene las libs nativas de
  Chromium) que se corrigió en esta fase instalando el paquete `chromium` de
  Debian. Sin esa corrección, cualquier compra de Gift Card habría fallado en
  producción con un error de librería compartida faltante.

No se corrió el flujo completo de un pago real ni un mensaje de WhatsApp real
contra este build — eso requiere las URLs públicas de producción (huevo y
gallina: Meta/Wompi necesitan una URL ya desplegada para poder registrar el
webhook). Verificar ambos flujos end-to-end apenas el dominio esté activo
(sección 4 de este documento).

**Nota sobre la versión de Node**: `puppeteer@25.7.0` (Fase 8) declara
`engines.node: ">=22.12.0"`. El proyecto corría sobre `node:20-slim` desde la
Fase 0 sin que nadie lo hubiera actualizado — funcionaba igual en desarrollo,
pero es una inconsistencia que vale la pena no arrastrar a producción.
Actualizado `Dockerfile` (`node:22-slim`) y `package.json` (`engines.node
>=22`) en esta fase. Si tu Node local es 20.x, `npm install` te va a avisar
con `EBADENGINE` (advertencia, no error) — no bloquea el desarrollo local,
pero considera actualizar tu Node para que coincida con producción.

## 1. Crear el proyecto en Railway

Ya hecho para este servicio (ver "Estado real" arriba). Para un entorno
nuevo (ej. staging, o si hay que recrearlo):

1. Crear un proyecto nuevo (o usar uno existente).
2. `railway up` desde la raíz del repo (sube el directorio local como
   tarball y crea proyecto + servicio si no hay uno linkeado — respeta
   `.gitignore`, así que no sube `node_modules`/`.env`/`dist`). Alternativa:
   conectar un repo de GitHub y dejar que Railway autodespliegue en cada push.
3. **No** agregar un servicio de Postgres de Railway — la base de datos es
   Supabase, ya existente (sección 2 del prompt maestro: Supabase es la
   única source of truth).

## 2. Variables de entorno

Configurar en el servicio de Railway (Settings → Variables, o `railway
variable set`) todas las variables de `docs/ENVIRONMENT.md`. Puntos
importantes:

- `NODE_ENV=production` — setearla explícitamente. Railway no la fija por
  vos, y sin ella el `Dockerfile` sigue diciendo `production` (su `ENV`
  interno), pero cualquier variable que pongas en el dashboard tiene
  prioridad — ver la nota de `docs/ENVIRONMENT.md`.
- `PORT=3000` — **fijarla explícitamente**, no dejar que Railway asigne una
  sola. Ver la nota de puerto en `docs/ENVIRONMENT.md`: sin esto, el dominio
  generado puede terminar apuntando a un puerto distinto al que escucha la
  app y da `502 Application failed to respond` aunque el deploy diga
  `SUCCESS` — nos pasó desplegando este mismo servicio.
- `APP_URL` — todavía no la vas a tener hasta el paso 3 (necesitás el dominio
  que te da Railway primero). Poné un valor provisional y actualizalo después
  — cambiar una env var en Railway redeploya solo.
- `DATABASE_URL` / `DIRECT_URL` — las mismas del Supabase de producción (o de
  staging, si ese es el que vas a usar primero). `DIRECT_URL` es la que
  necesita `prisma migrate deploy` en el arranque del contenedor.
- Copiá los secretos (`SUPABASE_SERVICE_ROLE_KEY`,
  `WHATSAPP_ACCESS_TOKEN`/`APP_SECRET`, `PAYMENT_*`,
  `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `STAFF_PIN`, `INTERNAL_JOBS_TOKEN`)
  directo del gestor de secretos que estés usando — nunca los pegues en un
  chat, PR o issue.

## 3. Primer deploy y dominio

1. Disparar el deploy (push a la rama conectada, o `railway up`).
2. Seguir los logs de build/deploy — deberían verse las mismas líneas que en
   la verificación local de la sección 0 (`prisma migrate deploy`, luego
   `server_started`, luego `scheduled_jobs_started`).
3. Generar un dominio: `railway domain --port 3000` (o Settings → Networking
   → Generate Domain, poniendo el mismo puerto que `PORT`).
4. Actualizar `APP_URL` en las variables de entorno con ese dominio
   (`https://...`) y esperar el redeploy automático.
5. Confirmar `https://<tu-dominio>/health` → `200 {"status":"ok","db":"ok"}`.
   Si da `502`, revisar que el target port del dominio (`railway domain
   status <dominio>`) coincida con `PORT`.

## 4. Configurar los webhooks externos

Con la app ya en `https://spa-mvp-production.up.railway.app`:

- **WhatsApp** (`docs/WHATSAPP.md`): Meta for Developers → tu app → WhatsApp
  → Configuration → Webhook. URL:
  `https://spa-mvp-production.up.railway.app/api/webhooks/whatsapp`.
  Verify token: el mismo valor que pusiste en `WHATSAPP_VERIFY_TOKEN`. Suscribir
  el campo `messages`.
- **Pagos** (`docs/PAYMENTS.md`): Dashboard de Wompi → Desarrolladores →
  Eventos. URL:
  `https://spa-mvp-production.up.railway.app/api/webhooks/payment`. Confirmar
  que `PAYMENT_WEBHOOK_SECRET` en Railway coincide con el secreto de eventos
  que te muestra el dashboard.
- **Google Sheets** (`docs/GOOGLE-SHEETS.md`): no requiere webhook, solo que
  la Service Account tenga acceso de editor al Sheet de producción.

Después de registrar cada uno, probar el flujo real completo una vez (una
reserva pagada de verdad, o el "Comprobar webhooks de prueba" de
Meta — ese panel no confirma entrega real, ver `docs/WHATSAPP.md`).

## 5. Seed (opcional)

Si el negocio de producción no existe todavía en la base de datos de
producción, correr el seed una vez contra ese `DATABASE_URL`/`DIRECT_URL`
(`npm run prisma:seed` local, apuntando el `.env` a producción — o
`railway run npm run prisma:seed` si preferís ejecutarlo en el entorno de
Railway). El seed crea "Demo Spa" — para el primer cliente real, reemplazar
esos datos en Supabase directamente (sección 42 del prompt maestro: sin
dashboard admin todavía, la configuración inicial es manual).

## 6. Qué monitorear después de desplegar

- `GET /health` — Railway ya lo usa como healthcheck (`railway.json`); podés
  además pegarle un monitor externo (UptimeRobot, etc.) si querés alertas.
- Logs estructurados (`src/utils/logger.ts`) — buscar `unhandled_error`
  (nunca debería aparecer en operación normal, ver `docs/TESTING.md`
  hallazgo #3) y `client_error`/`cron_*_failed`.
- El scheduler (Fase 9) loguea `cron_expired_appointments` y
  `cron_reminders_sent` solo cuando hay algo que hacer — silencio ahí es
  normal, no un problema.

## Qué falta / fuera de este documento

- Webhooks de WhatsApp y Wompi todavía no registrados contra la URL real
  (sección 4) — sin esto, los mensajes de WhatsApp y las confirmaciones de
  pago no le llegan a la app todavía, aunque la API ya esté viva.
- No se probó un pago real ni un mensaje de WhatsApp real end-to-end contra
  este deploy (necesita los webhooks registrados primero).
- Sin dashboard administrativo (sección 4/42 del prompt maestro): cambios de
  configuración del negocio (precios, horarios, diseños) siguen siendo
  manuales en Supabase.
