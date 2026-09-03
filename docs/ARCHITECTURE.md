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

### Pendiente para la fase SaaS: onboarding de WhatsApp por cliente

Hoy `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` son variables de
entorno globales de un solo negocio — asumen una única app de Meta Developer
configurada a mano (ver `docs/DEPLOYMENT.md`). Eso no escala a multi-tenant:
cada cliente nuevo no debería tener que crear su propia app en Meta for
Developers, que es un proceso técnico y poco amigable para un dueño de spa.

La solución estándar es **Embedded Signup** (el flujo oficial de Meta para
"Tech Providers"): la plataforma mantiene **una sola** app de Meta, y cada
cliente conecta su número de WhatsApp Business con un flujo corto tipo
"Continuar con Facebook", sin pasar por Meta for Developers. Requiere:

- Guardar `access_token` y `phone_number_id` **por `business_id`** (columnas
  nuevas en `businesses`, no env vars globales) — probablemente cifradas en
  reposo, no solo protegidas por RLS.
  `MetaWhatsAppProvider`/`WhatsAppProvider` (Fase 6, sección 26) ya están
  abstraídos por interfaz, así que el cambio es en cómo se resuelven las
  credenciales por negocio antes de instanciar el provider, no en la lógica
  de envío/parseo de mensajes.
- Implementar el flujo de Embedded Signup (SDK de Facebook Login para
  Business + intercambio de código por token de larga duración).

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

Interfaz `PaymentProvider` (`createPayment`, `validateWebhook`, `parseWebhook`)
con un primer adapter `WompiPaymentProvider` (default: Colombia / COP /
`America/Bogota`, decisión de Fase 0 — pendiente de confirmar con el primer
cliente real). Cambiar de proveedor implica escribir un nuevo adapter, no
tocar el resto de la aplicación. Detalle completo del flujo, la verificación
de firma y las reglas de idempotencia en `docs/PAYMENTS.md`.

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

## Qué NO se construye en el MVP

Ver sección 4 del prompt maestro: sin app móvil, sin dashboard admin complejo,
sin sistema de empleados, sin inventario/contabilidad/facturación, sin
membresías/suscripciones, sin CRM avanzado, sin IA conversacional para lógica
crítica, sin microservicios/Kubernetes/Redis/RabbitMQ.

> **Actualización (2026-09):** el proyecto sí evoluciona hacia panel de
> operador, suscripciones/facturación interna y CRM con portal de cliente —
> como fase posterior al MVP y en su propia app (`apps/panel/`), no en el
> backend. Plan completo en `docs/PANEL-OPERADOR.md`.
