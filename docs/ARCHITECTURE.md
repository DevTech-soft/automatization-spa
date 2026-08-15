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
- **Puppeteer** (a introducir en Fase 8) para generar Gift Cards en PDF/PNG a
  partir de un template HTML/CSS.
- Estructura de carpetas "plana" (`src/config`, `src/services`, etc., sección 24
  del prompt maestro) en vez del monorepo completo: no hay beneficio de
  workspaces cuando solo existe un backend real y un frontend sin build step.

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

Plan original de Fase 0 (para cuando se introduzca n8n, ej. en Fase 9):

- `10_appointment_reminders`: cron que llama a un endpoint interno del backend.
- `11_cleanup_expired_appointments`: cron que llama a un endpoint interno del backend.

Si más adelante conviene meter n8n en el medio (para los cron jobs de Fase 9,
o para desacoplar reintentos de webhooks), el cambio es aislado: los
providers (`WhatsAppProvider`, `PaymentProvider`, `GoogleSheetsProvider`) ya
son la capa de abstracción correcta para hacerlo sin tocar la lógica de
negocio.

## Multi-tenancy

Toda entidad de negocio lleva `business_id`. El backend siempre filtra por
`business_id` en cada query. Row Level Security de Supabase se deja para una
fase SaaS futura: en el MVP solo el backend (con `SUPABASE_SERVICE_ROLE_KEY`)
toca la base de datos — el frontend y n8n nunca acceden a Supabase directamente.

El canal WhatsApp (Fase 6) es el primero que resuelve el tenant sin ayuda de
un query param: cada mensaje entrante trae el número de WhatsApp que lo
recibió, que se compara contra `businesses.whatsapp_number`. Ver
`docs/WHATSAPP.md`.

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
