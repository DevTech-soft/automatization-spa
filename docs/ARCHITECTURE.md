# Arquitectura

Decisiones de diseño acordadas en la Fase 0. Este documento se amplía en cada fase
(la especificación completa vive en el prompt maestro del proyecto).

## Principio fundamental

```
Supabase        = source of truth
n8n             = orquestador (sin lógica de negocio ni estado propio)
Google Sheets   = vista administrativa (nunca decide disponibilidad ni pagos)
WhatsApp        = canal de comunicación
Formulario web  = canal de reserva
Payment gateway = fuente de verdad del estado del pago
```

## Stack y por qué

- **Fastify** sobre Express: soporte TS nativo, validación por schema integrada,
  encapsulación por plugins que encaja con la separación
  controller → service → repository.
- **Prisma** como ORM contra el Postgres de Supabase: migraciones versionadas,
  tipado end-to-end, `prisma/seed.ts` para datos de prueba.
- **Luxon** para todo cálculo de fecha/hora, siempre a través de un único helper
  que usa `business.timezone`. Evita bugs de "una hora de diferencia" al
  centralizar la conversión.
- **Frontend vanilla** sin build step, servido como estáticos por el propio
  backend: un solo contenedor desplegable, sin CORS entre `/reservar` y la API.
- **Puppeteer** (Fase 8) para generar Gift Cards en PNG a partir de un
  template HTML/CSS — ver "Gift Cards: imagen + almacenamiento" más abajo.
- Estructura de carpetas "plana" (`src/config`, `src/services`, etc., sección 24
  del prompt maestro) en vez del monorepo completo: no hay beneficio de
  workspaces cuando solo existe un backend real y un frontend sin build step.

  > **Actualización (Fase F0 de `docs/PANEL-OPERADOR.md`, 2026-09):** ese
  > supuesto cambió. Al agregarse el panel de operador + CRM (Next.js), el repo
  > pasó a **monorepo pnpm + Turborepo**: el backend vive en `apps/backend/`, el
  > schema Prisma en `packages/db/` (`@spa/db`), y el panel irá en
  > `apps/panel/`. El backend sigue siendo el único con acceso a la base de
  > datos. Ver `docs/PANEL-OPERADOR.md` §8.
  >
  > El resto de F0 también está en `main`: el **modelo de datos multi-cliente**
  > (`Business.status`/`chargeMode`/`depositPercentage`, `WhatsAppAccount`,
  > `PaymentCredentials`, `SubscriptionPlan`, `OperatorInvoice`/`OperatorPayment`,
  > `ClientContact`, `AuditLog` — migración `20260903194848_panel_operador_data_model`)
  > y el **cifrado de secretos por-tenant** (`apps/backend/src/utils/crypto.ts`,
  > AES-256-GCM con `SECRETS_ENCRYPTION_KEY`). Los tokens de WhatsApp y llaves de
  > Wompi se guardan en columnas `*_enc`. El wiring (guards, webhooks por-tenant,
  > panel) llega en F1–F5.
  >
  > **F3a (auth del panel):** **Better Auth se monta en ESTE backend**
  > (`/api/auth/*`, `src/auth/better-auth.ts`) — Postgres sigue 100% en el
  > backend. El panel (`apps/panel/`, Vercel) será cliente puro con patrón BFF.
  > Las rutas `/admin/*` validan la sesión de Better Auth en cada request
  > (`requireOperatorSession`). Tipos/Zod compartidos en `packages/shared`
  > (`@spa/shared`, compila a `dist/`). Tablas de Better Auth: migración
  > `..._better_auth`.

## Superficies de interfaz

El MVP nació como un backend **desatendido**: sin panel, con Google Sheets como
única vista administrativa y la configuración inicial a mano (sección 42 del
prompt maestro). Ese supuesto **ya no aplica** — al pasar a multi-cliente el
sistema tiene tres superficies distintas, cada una con su propia audiencia y su
propia auth:

| Superficie | Quién entra | Dónde vive | Auth |
|---|---|---|---|
| **Páginas públicas** (`/reservar`, `/gracias`, `/validar`) | las clientas del spa, y su staff para canjear | `apps/backend/web/`, estáticos servidos por el backend | ninguna (el canje pide `STAFF_PIN`) |
| **Panel de operador** | el dueño del software | `apps/panel/` (Next.js en Vercel) | Better Auth, rol `operator` |
| **Portal de cliente** (dashboard del spa) | el dueño de cada negocio y su equipo | la misma app `apps/panel/`, con guard por rol | Better Auth, roles `client_owner` / `client_staff` |

Las tres consumen la API del backend; **ninguna toca Postgres directo** (D10 de
`docs/PANEL-OPERADOR.md`). Lo que cambia entre el panel y el portal no es el
stack ni las rutas, sino el alcance: el operador ve todos los negocios, el
cliente ve **el suyo**.

### Panel de operador — hecho

Es el puesto de mando del negocio del operador:

- **Clientes**: alta, marca, checklist de onboarding y activación, y la máquina
  de estados (`trial → active → past_due → suspended → cancelled`) con motivo
  obligatorio y bitácora.
- **Cartera**: plan de suscripción por negocio, cuentas de cobro con
  consecutivo propio, pagos recibidos, recibos y cuentas en PDF, y el ciclo
  diario que emite, marca en mora y suspende solo.
- **Consumo**: citas, conversaciones, gift cards y volumen transaccionado por
  cada cliente — el argumento de la renovación.
- **Integraciones por negocio**: número de WhatsApp y llaves de Wompi, cifradas
  en reposo y siempre enmascaradas de vuelta.
- **Bitácora**: toda acción sensible con actor, momento y valores.

Detalle de rutas en `docs/API.md`; decisiones y fases en `docs/PANEL-OPERADOR.md`.

### Portal de cliente — la arquitectura ya lo asume

El siguiente paso (F7) es que **cada spa entre a su propio dashboard**: sus
citas del día, las conversaciones de su bot, sus gift cards, sus métricas y sus
ajustes de negocio. No hay que rehacer nada para llegar ahí, y esa es la razón
de tres decisiones ya tomadas:

1. **Los DTO de actividad y métricas viven en `packages/shared`**, no en el
   backend: el portal pinta exactamente los mismos objetos que hoy pinta el
   panel (`AppointmentRow`, `ConversationRow`, `BusinessUsage`…).
2. **Todos los endpoints por negocio nacen filtrados por `businessId`**
   (`/admin/businesses/:id/appointments`, `.../conversations`, `.../usage`…).
   No existe un listado "de todos los negocios" que haya que restringir después:
   activar el portal es cambiar quién puede pedir qué `businessId`, no
   reescribir consultas.
3. **Better Auth trae `organization` desde el primer commit**, con
   `Organization.businessId` espejo de cada negocio. El tenant ya está modelado;
   F7 enciende los roles `client_owner` / `client_staff` y hace que
   `requireOperatorSession` derive el `businessId` de la sesión en vez de
   dejarlo abierto.

Lo que sí falta construir en F7: los roles y sus invitaciones, el guard por
rol, la navegación del portal, y —si se quiere ver la conversación y no solo su
estado— una tabla de mensajes de WhatsApp, que hoy **no existe**:
`whatsapp_conversations` guarda el estado de la máquina de conversación
(sección 18), no la transcripción.

## Rol de n8n

**Actualización de Fase 4/6/7** (corrige el plan original de Fase 0 de abajo):
en la práctica, WhatsApp (Meta) y el proveedor de pago (Wompi) le hablan
**directamente** al backend — `POST /api/webhooks/whatsapp` y
`POST /api/webhooks/payment` son endpoints públicos reales, verificados
end-to-end contra ambos proveedores (ver `docs/WHATSAPP.md` y
`docs/PAYMENTS.md`) — y la sincronización a Google Sheets (Fase 7) también
llama a la API de Google directamente desde el backend (ver
`docs/GOOGLE-SHEETS.md`). No hay una instancia de n8n desplegada todavía en
este MVP. Esto simplifica el despliegue (un servicio menos que mantener vivo)
sin romper el principio de la sección 18: el backend sigue siendo la única
fuente de verdad, nada de esto le da a un tercero poder de decisión sobre
disponibilidad, precio o estado de pago.

**Decisión de Fase 9**: los dos cron jobs pendientes (`10_appointment_reminders`,
`11_cleanup_expired_appointments`) tampoco necesitan n8n. Son llamadas
periódicas a lógica que ya vive en el backend — meter un orquestador externo
solo para eso sería la sobreingeniería que prohíbe la sección 46 (20 líneas y
una dependencia vs. un servicio adicional que mantener vivo, con un trial de
14 días de por medio). En su lugar, `src/jobs/scheduler.ts` usa `node-cron`
in-process, arrancado únicamente desde `server.ts` (nunca desde `app.ts`, para
que los tests que usan `buildApp()` no disparen jobs de fondo):

- cada 5 min, `expireStalePendingAppointments()` — libera el horario de
  reservas `PENDING` vencidas (sección 10).
- cada hora, `sendUpcomingAppointmentReminders()` — recordatorio ~24h antes de
  cada cita `CONFIRMED` (sección 21), con `REMINDER_WINDOW_MINUTES` (90 min)
  mayor a la frecuencia del cron para no dejar huecos entre corridas; la
  idempotencia real la da `notification_log` (tipo `APPOINTMENT_REMINDER`), no
  la ventana.

Los mismos endpoints internos que llama el scheduler (`POST
/internal/jobs/expire-appointments`, `POST /internal/jobs/send-reminders`,
protegidos con `INTERNAL_JOBS_TOKEN`) siguen expuestos para un trigger manual
o, si algún día el backend se despliega en un entorno sin proceso persistente,
un cron externo gratuito (GitHub Actions scheduled workflow, cron-job.org)
apuntando a ellos — sin tocar la lógica de negocio.

Si más adelante conviene meter n8n en el medio de todos modos (por ejemplo
para desacoplar reintentos de webhooks), el cambio es aislado: los providers
(`WhatsAppProvider`, `PaymentProvider`, `GoogleSheetsProvider`) ya son la capa
de abstracción correcta para hacerlo sin tocar la lógica de negocio.

## Multi-tenancy

Toda entidad de negocio lleva `business_id`. El backend siempre filtra por
`business_id` en cada query. Row Level Security de Supabase se deja para una
fase SaaS futura: en el MVP solo el backend (con `SUPABASE_SERVICE_ROLE_KEY`)
toca la base de datos — el frontend y n8n nunca acceden a Supabase directamente.

El canal WhatsApp (Fase 6) es el primero que resuelve el tenant sin ayuda de
un query param: cada mensaje entrante trae el número de WhatsApp que lo
recibió, que se compara contra `businesses.whatsapp_number`. Ver
`docs/WHATSAPP.md`.

> **Actualización F1 (`docs/PANEL-OPERADOR.md`):** el webhook ahora resuelve el
> tenant preferentemente por `metadata.phone_number_id` vía
> `whatsAppAccountRepository` (llave estable de Meta), y cae al match por
> `whatsapp_number` mientras F4 no puebla `whatsapp_accounts`. Además todas las
> puertas de entrada (reservas, gift cards nuevas, agente) pasan por
> `business-guard.ts`, que corta `SUSPENDED` (403) y `CANCELLED` (404); WhatsApp
> aplica suspensión suave (mensaje único) / silencio. Máquina de estados del
> negocio: `docs/PANEL-OPERADOR.md` §5.

### WhatsApp por cliente

**Hecho (F4, primera mitad).** El envío ya no depende de las env globales:
`resolveWhatsAppProviderForBusiness` (`src/services/whatsapp-provider-resolver.ts`)
busca el número conectado del negocio en `whatsapp_accounts` —con su
`access_token` cifrado— y construye el provider con **esas** credenciales. Si el
negocio todavía no conectó el suyo, cae a `WHATSAPP_ACCESS_TOKEN`/
`WHATSAPP_PHONE_NUMBER_ID`, que pasan de ser "la configuración" a ser el
fallback del operador. Es el mismo patrón que F2 usó para las llaves de Wompi.

Todo lo que envía —notificaciones, bot de menús, respuestas del agente— pasa por
ese resolver. Lo que ocurre **antes** de saber de qué negocio es un mensaje
(validar la firma del webhook y parsear el payload) usa
`getWhatsAppWebhookReader()`, que no exige credenciales: la firma
`X-Hub-Signature-256` la calcula Meta con el **app secret**, que es de la app del
operador y sigue siendo único para todas las WABAs conectadas.

**Falta (F4, segunda mitad): Embedded Signup.** Hoy el operador da de alta el
número de cada cliente a mano desde el panel (WABA ID, `phone_number_id` y
token), con el número viviendo bajo su propia WABA — el puente de
`docs/PANEL-OPERADOR.md` §7.3. Funciona y no escala: tiene tope de números y de
mensajería mientras el negocio del operador no esté verificado en Meta.

La solución definitiva es **Embedded Signup** (el flujo oficial de Meta para
"Tech Providers"): la plataforma mantiene **una sola** app, y cada cliente
conecta su propio número con un "Continuar con Facebook", sin pasar por Meta for
Developers. El backend ya tiene el lado que importa —credenciales por negocio,
cifradas, y un único punto de alta (`connectWhatsAppAccount`)—; falta el flujo de
Facebook Login for Business y el intercambio de código por token de larga
duración, y sobre todo lo que lo bloquea: la verificación de negocio en Meta,
que exige que el operador se formalice (M-1/M0 del plan).

Alternativa a evaluar en su momento: un BSP (360dialog, Twilio, Gupshup) que
envuelve el mismo Embedded Signup con una API más simple y soporte, a cambio
de un costo recurrente por mensaje/mes — encajaría igual detrás de la interfaz
`WhatsAppProvider` como un adapter nuevo.

## Modelo de recursos (disponibilidad)

El spa puede tener varias citas en paralelo (varias sillas/camillas), pero sin
modelar personal ni asignación de recursos (fuera de scope, sección 4). Solución
mínima: `services.capacity` (entero, default 1). La disponibilidad de un slot se
calcula como:

```
citas CONFIRMED + PENDING-no-expiradas de ese service_id que solapan el slot < capacity
```

El control de concurrencia (Fase 3, sección 12) usa `pg_advisory_xact_lock` con
clave `(business_id, service_id, appointment_date)` envolviendo el recuento de
solapes + insert en una misma transacción — así dos requests simultáneas al
mismo slot no pueden pasar ambas el chequeo. Verificado end-to-end contra
Supabase: de dos reservas concurrentes al mismo slot con `capacity=1`, una
recibe `201` y la otra `409 AVAILABILITY_ERROR`.

Como red de seguridad a nivel de base de datos se agregó un **trigger**
(`prisma/migrations/..._appointment_capacity_trigger`), no una constraint
`EXCLUDE`: un `EXCLUDE` clásico impide que dos filas se solapen (pairwise), pero
`services.capacity` permite varias citas `CONFIRMED` en paralelo para el mismo
servicio — se necesita contar solapes contra la capacidad, no solo detectarlos.
El trigger corre `BEFORE INSERT OR UPDATE` y solo actúa cuando `status =
'CONFIRMED'`. Prisma no gestiona triggers, así que este SQL vive únicamente en
la migración y no se toca al correr `prisma migrate dev` en el futuro.

## Pagos

Interfaz `PaymentProvider` (`createPayment`, `validateWebhook`, `parseWebhook`,
`extractWebhookReference`) con un primer adapter `WompiPaymentProvider` (default:
Colombia / COP / `America/Bogota`, decisión de Fase 0 — pendiente de confirmar
con el primer cliente real). Cambiar de proveedor implica escribir un nuevo
adapter, no tocar el resto de la aplicación. Detalle completo del flujo, la
verificación de firma y las reglas de idempotencia en `docs/PAYMENTS.md`.

> **Actualización F2 (`docs/PANEL-OPERADOR.md` §D3/§6.2-6.3):** las llaves de
> Wompi pueden vivir **por negocio** en `payment_credentials` (cifradas,
> `paymentCredentials.repository`), con fallback a las env `PAYMENT_*` globales.
> El webhook es **multi-comercio**: lee la `reference` sin validar, resuelve el
> negocio dueño del `Payment` y recién ahí valida la firma con el secreto de ese
> comercio. Las reservas tienen **modo de cobro** `TOTAL` / `DEPOSIT` (abono):
> `business.chargeMode` + `depositPercentage` → el link cobra el abono, el saldo
> se paga presencial (`appointment.depositAmount` / `pendingBalance`,
> `paymentStatus = DEPOSIT_PAID`).

El webhook (`POST /api/webhooks/payment`, Fase 4) es la única fuente que puede
confirmar un pago (sección 9). Usa `pg_advisory_xact_lock(hashtext(reference))`
para serializar entregas duplicadas del mismo evento, y reutiliza el
`pg_advisory_xact_lock(business_id, service_id, appointment_date)` de la Fase 3
al confirmar la reserva, para no violar `capacity` bajo concurrencia real.

## Frontend (`web/`)

HTML/CSS/JS vanilla sin build step (sección 3), servido como estáticos por el
propio backend vía `@fastify/static` (`src/app.ts`), montado en la raíz junto
con las rutas de API — un solo contenedor desplegable, sin CORS entre
`/reservar` y `/api/*`. `web/reservar/` y `web/gracias/` son páginas; `web/css`
y `web/js` son los assets compartidos. `web/**` está excluido del lint de
TypeScript (`eslint.config.js`) por ser JS de navegador con globals propios
(`fetch`, `document`), no Node.

`/reservar` no tiene selector de negocio en la UI: usa `?negocio=<slug>` (por
defecto `demo-spa`) para resolver qué negocio reservar — suficiente para el
MVP de un solo cliente activo, sin bloquear el modelo multi-tenant subyacente.

## Gift Cards: imagen + almacenamiento

La imagen de la Gift Card se genera renderizando HTML+CSS a PNG con
Puppeteer (`gift-card-image.service.ts`) — reusa el mismo lenguaje visual
del sitio en vez de dibujar con un API de bajo nivel. Se sube a Supabase
Storage vía la interfaz `StorageProvider` (mismo patrón adapter que
`PaymentProvider`/`WhatsAppProvider`/`GoogleSheetsProvider`: `upload`,
`getPublicUrl`, `delete`), con `SupabaseStorageProvider` como único adapter
por ahora. El bucket público se crea automáticamente en el primer upload si
no existe. Todo el pipeline (imagen → Storage → WhatsApp → Sheets) corre
fuera de la transacción del webhook de pago, después de confirmarlo — un
fallo ahí nunca revierte el pago ya confirmado (mismo principio que
`notifyAppointmentConfirmed`, Fase 6). Detalle completo, incluyendo dos bugs
reales encontrados en la prueba en vivo (una trampa de la API de Supabase
Storage y una restricción de CSP), en `docs/GIFT-CARDS.md`.

## Protección de canje de Gift Cards

`/validar` (consulta) es pública. `POST /api/gift-cards/redeem` (destructivo, un
solo uso) exige un `STAFF_PIN` compartido (env var) — no hay sistema de login de
clientes ni de staff en scope (sección 4), pero dejar el canje sin ninguna
protección es un riesgo real. Se documenta como control mínimo, no como
autenticación real.

## Idempotencia de notificaciones

Tabla `notification_log` (`entity_type`, `entity_id`, `type` con constraint
única) para garantizar que confirmaciones y recordatorios no se envíen
duplicados (secciones 21 y 32), sin necesitar columnas booleanas por tipo de
notificación en cada tabla.

## Alcance: qué se construye y qué no

### El MVP (secciones 1–42 del prompt maestro) — hecho

Backend Fastify: reservas web + WhatsApp (bot determinístico y agente n8n),
pagos Wompi, Gift Cards, recordatorios, sincronización a Google Sheets. Un solo
negocio. Sus únicas páginas propias son las públicas de `web/` (`/reservar`,
`/gracias`, `/validar`); las interfaces de gestión viven en `apps/panel/` y
consumen la API `/admin/*` — ver "Superficies de interfaz" más arriba.

### Post-MVP: multi-cliente + panel de operador + CRM — en curso

El proyecto **sí** evoluciona más allá de lo que la sección 4 del prompt maestro
excluía. Plan completo y decisiones en **`docs/PANEL-OPERADOR.md`**; resumen del
estado por fase en su §10. En construcción / hecho:

- **Integraciones por-tenant** (F1–F2, hechas): estado de suscripción del negocio
  con guard en cada entrada, resolución de tenant de WhatsApp por
  `phone_number_id`, credenciales de Wompi cifradas por negocio, webhook
  multi-comercio, modo de cobro `total`/`abono`.
- **Panel de operador** (F3, hecho): app Next.js en `apps/panel/` (Vercel), API
  `/admin/*` en el backend con Better Auth (sesión + filtro de tenant). El
  backend **sigue siendo el único con acceso a Postgres** — el panel nunca lo
  toca directo. Alta y marca de negocios, onboarding, cambio de estado, cartera,
  consumo por cliente, integraciones y bitácora. Ver "Superficies de interfaz".
- **Suscripciones y cobro interno** (F5, hecho): planes con vencimiento, cuentas
  de cobro + recibos en PDF, auto-suspensión por mora con ciclo diario. Es cobro
  **del operador a sus clientes**, no membresías de las clientas del spa.
- **WhatsApp por-tenant** (F4, a medias): el envío ya sale con las credenciales
  del negocio; falta el Embedded Signup, bloqueado por la verificación en Meta.
- **Portal de cliente / CRM** (F7, siguiente): cada spa entra a ver sus citas,
  las conversaciones de su bot, sus métricas y sus ajustes. El modelo de tenant,
  los DTO y los endpoints ya están diseñados para eso.

### Fuera de alcance (sigue sin construirse)

- **App móvil nativa.** Todo es web.
- **Gestión de empleados / turnos / nómina.** El modelo tiene `capacity` por
  servicio, no agenda por profesional.
- **Inventario, contabilidad, POS.**
- **Facturación electrónica DIAN.** Se emiten cuentas de cobro + recibos
  internos; la facturación formal (Alegra/Siigo/Factus) queda para cuando el
  operador se formalice y sea responsable de IVA (D7, §11 del plan).
- **IA conversacional para la lógica crítica.** El agente n8n asiste la
  conversación, pero disponibilidad, concurrencia, hold de pago y confirmación
  viven en reglas deterministas del backend (secciones 12/18/22).
- **Registro self-service de clientes.** El operador da de alta cada negocio a
  mano (no es un SaaS público).
- **Microservicios / Kubernetes / Redis / RabbitMQ.** Un contenedor (backend en
  Railway) + una app (panel en Vercel) + n8n.
- **Row Level Security de Supabase.** El aislamiento por tenant vive en el
  backend (filtro por `business_id` en cada query y en el guard de `/admin/*`);
  RLS se evalúa si en algún momento algo distinto del backend toca la DB.
