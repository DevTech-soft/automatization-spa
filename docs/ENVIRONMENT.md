# Variables de entorno

Referencia completa de `.env.example`. Validadas por `src/config/env.ts`
(Zod) — si falta una variable requerida, el proceso no arranca y lo dice por
consola (`npm run dev` / `npm start`), no falla en silencio.

## App

| Variable | Requerida | Notas |
|---|---|---|
| `NODE_ENV` | no (default `development`) | **En producción, ponerla explícitamente en `production`.** El `Dockerfile` ya la fija así (`ENV NODE_ENV=production` en el stage `runtime`), pero cualquier variable de entorno del hosting (ej. las de Railway) la sobreescribe — verificado en Fase 11: correr la imagen con `--env-file .env` (que trae `NODE_ENV=development` para desarrollo local) hace que el contenedor arranque en modo `development` aunque la imagen lo fije distinto. Afecta CORS (sección de abajo) y si se usa el transport `pino-pretty` (solo en `development`). |
| `PORT` | no (default `3000`) | **En Railway, fijarla explícitamente (`PORT=3000`) y usar ese mismo número como target port del dominio.** Verificado en Fase 11: sin fijarla, Railway le asigna un puerto propio al contenedor (ej. `8080`) y lo inyecta bien, pero el dominio generado (`railway domain`) apunta por defecto al puerto que le pasaste (o a uno que no coincide) — el resultado es `502 Application failed to respond` aunque el deploy esté `SUCCESS` y el health check interno de Railway pase. Fijar `PORT` y hacer que el target port del dominio coincida elimina la ambigüedad. |
| `APP_URL` | sí | URL pública de la API. La usa el checkout de Wompi (redirect) y debe ser HTTPS en producción — ver `docs/PAYMENTS.md` ("Con `APP_URL=http://localhost:3000` el checkout no carga"). |
| `APP_TIMEZONE` | no (default `America/Bogota`) | Timezone del negocio — sección 1 del `.env.example`. Todo el cálculo de disponibilidad pasa por acá (`src/utils/datetime.ts`). |
| `LOG_LEVEL` | no (default `info`) | `fatal\|error\|warn\|info\|debug\|trace`. |

## Base de datos (Supabase Postgres)

| Variable | Requerida | Dónde conseguirla |
|---|---|---|
| `DATABASE_URL` | sí | Supabase → Project Settings → Database → Connection string (**Transaction pooler**, puerto 6543 — es la que usa la app en runtime). |
| `DIRECT_URL` | sí | Misma pantalla, conexión **directa** (puerto 5432, sin pooler) — la necesita `prisma migrate deploy` (las migraciones no funcionan bien a través del transaction pooler). |

## Supabase

| Variable | Requerida | Dónde conseguirla |
|---|---|---|
| `SUPABASE_URL` | sí | Project Settings → API → Project URL. |
| `SUPABASE_ANON_KEY` | sí | Project Settings → API → `anon`/`public` key. No se usa para escribir (el backend usa la service role), queda por si se necesita en el futuro. |
| `SUPABASE_SERVICE_ROLE_KEY` | sí | Project Settings → API → `service_role` key. **Nunca exponerla al frontend** (sección 29) — solo la usa el backend. |

## WhatsApp Business Cloud API (Meta)

Ver `docs/WHATSAPP.md` para el flujo completo.

| Variable | Requerida | Dónde conseguirla |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | sí para enviar mensajes | Meta for Developers → tu app → WhatsApp → API Setup. El token temporal expira en 24h — para producción, generar uno de **System User** de larga duración (Business Settings → System Users). |
| `WHATSAPP_PHONE_NUMBER_ID` | sí | Meta for Developers → WhatsApp → API Setup. |
| `WHATSAPP_VERIFY_TOKEN` | sí | Lo inventás vos (cualquier string). Se usa en el handshake `GET` cuando configurás la URL del webhook en Meta — tiene que coincidir con lo que pongas ahí. |
| `WHATSAPP_APP_SECRET` | recomendada en producción | Meta for Developers → tu app → Configuración básica → App Secret. Sin esto el webhook funciona pero sin validar `X-Hub-Signature-256` (sección 29 — no usar así en producción). |

## Pagos (Wompi)

Ver `docs/PAYMENTS.md` para el flujo completo y la verificación de firma.

| Variable | Requerida | Dónde conseguirla |
|---|---|---|
| `PAYMENT_PROVIDER` | no (default `wompi`) | `mercadopago` no está implementado todavía (sección 25 — la interfaz `PaymentProvider` ya está lista para ese adapter). |
| `PAYMENT_PUBLIC_KEY` | sí | Dashboard de Wompi → Desarrolladores → llave pública (`pub_test_...` / `pub_prod_...`). |
| `PAYMENT_INTEGRITY_SECRET` | sí | Dashboard de Wompi → Desarrolladores → Eventos → Integridad. Firma el checkout. |
| `PAYMENT_WEBHOOK_SECRET` | sí | Dashboard de Wompi → Desarrolladores → Eventos → secreto de eventos. Valida la firma del webhook entrante. |
| `PAYMENT_API_KEY` | no todavía | Guardada para uso futuro (llamadas server-to-server), no la usa el código actual. |

**Antes de ir a producción**: cambiar de llaves `_test_` a `_prod_` en Wompi, y registrar la URL real del webhook (`https://<tu-dominio>/api/webhooks/payment`) en el dashboard de Wompi.

## Google Sheets

Ver `docs/GOOGLE-SHEETS.md` para el flujo completo.

| Variable | Requerida | Dónde conseguirla |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | sí para sincronizar | Google Cloud Console → IAM → Service Accounts → creá una → copiá el email. Compartí el Google Sheet con ese email como editor. |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | sí para sincronizar | Del JSON de credenciales que descargás al crear la key de la Service Account (campo `private_key`). |
| `GOOGLE_SHEET_ID` | sí para sincronizar | De la URL del spreadsheet: `.../spreadsheets/d/<ID>/edit`. |

Sin estas tres, la app arranca igual (son opcionales en `env.ts`) pero la sincronización a Sheets falla silenciosamente (se loguea, no bloquea reservas ni pagos — sección 2).

## Storage y canje de Gift Cards

| Variable | Requerida | Notas |
|---|---|---|
| `STORAGE_BUCKET` | no (default `gift-cards`) | Se crea automáticamente como público en Supabase Storage en el primer upload si no existe. |
| `STAFF_PIN` | sí para poder canjear Gift Cards | Sin esto, `POST /api/gift-cards/redeem` se rechaza siempre (falla cerrado). Elegir un PIN — el endpoint ya tiene rate limit propio (5/min, Fase 10) además de comparación en tiempo constante. |

## Jobs internos

| Variable | Requerida | Notas |
|---|---|---|
| `INTERNAL_JOBS_TOKEN` | sí (mín. 16 caracteres) | Protege `/internal/jobs/*` (Fase 9). Generar con `openssl rand -hex 32`. El scheduler in-process (`src/jobs/scheduler.ts`) los llama solo — no hace falta configurar nada externo para que corran (ver "Rol de n8n" en `docs/ARCHITECTURE.md`). |

## CORS

`src/app.ts` restringe el `origin` a `APP_URL` únicamente cuando
`NODE_ENV=production` — en cualquier otro valor (`development`, `test`)
permite cualquier origen. Confirmar que `NODE_ENV=production` esté seteado en
el entorno de producción real (ver la nota de arriba sobre `NODE_ENV`).
