# API

Documentación de los endpoints implementados. Se amplía en cada fase — ver
`docs/ARCHITECTURE.md` para las decisiones de diseño detrás de ellos.

Formato de respuesta:

- Éxito: `{ "data": ... }`
- Error: `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`

## Fase 1

### `GET /health`

Verifica que la API responde y que la conexión a la base de datos está viva.

```
200 { "status": "ok", "db": "ok" }
503 { "status": "degraded", "db": "unreachable" }
```

## Fase 2 — Services & Availability

### `GET /api/business/:slug`

Devuelve un negocio activo por su slug.

- `404 NOT_FOUND` si no existe o está inactivo.

### `GET /api/services?businessId=<uuid>`

Lista los servicios activos de un negocio, ordenados por nombre.

- `400 VALIDATION_ERROR` si falta `businessId` o no es un UUID válido.
- `404 NOT_FOUND` si el negocio no existe.

### `GET /api/appointments/availability?businessId=<uuid>&serviceId=<uuid>&date=YYYY-MM-DD`

Calcula los horarios disponibles de un servicio para una fecha, en el timezone
del negocio. Único punto de verdad para disponibilidad — reutilizado por el
formulario web y (en Fase 6) por WhatsApp.

Reglas:

- Genera slots cada 30 minutos dentro de `business_hours` del día de la
  semana correspondiente, del tamaño de `service.duration_minutes`.
- Un slot está `available: false` si:
  - ya pasó (comparado contra la hora actual en el timezone del negocio), o
  - el número de citas `CONFIRMED` + `PENDING` no expiradas que se solapan con
    ese slot para ese `service_id` alcanza `service.capacity`.
- Si el negocio no abre ese día de la semana, devuelve `slots: []`.
- Rechaza fechas pasadas y fechas a más de 60 días de anticipación
  (`400 VALIDATION_ERROR`).

Respuesta:

```json
{
  "data": {
    "businessId": "uuid",
    "serviceId": "uuid",
    "date": "2026-01-05",
    "timezone": "America/Bogota",
    "slots": [
      { "startTime": "09:00", "endTime": "10:00", "available": false },
      { "startTime": "09:30", "endTime": "10:30", "available": true }
    ]
  }
}
```

- `400 VALIDATION_ERROR` si los parámetros son inválidos, la fecha está en el
  pasado o excede el máximo de anticipación.
- `404 NOT_FOUND` si el negocio o el servicio no existen.

## Fase 3 — Customers & Appointments

### `POST /api/appointments`

Crea una reserva `PENDING` (fuente `WEB`). Reutiliza la misma lógica de
disponibilidad y concurrencia que WhatsApp usará en Fase 6
(`src/services/appointment.service.ts`).

Body:

```json
{
  "businessId": "uuid",
  "serviceId": "uuid",
  "date": "2026-01-05",
  "startTime": "10:00",
  "customerName": "María Pérez",
  "customerPhone": "+573001112233",
  "customerEmail": "maria@example.com",
  "notes": "opcional"
}
```

Comportamiento:

- Hace *upsert* del cliente por `(business_id, phone normalizado)` — evita
  duplicar clientes (sección 6).
- Verifica el slot dentro de una transacción con `pg_advisory_xact_lock`
  (`business_id, service_id, date`) para que dos requests concurrentes al
  mismo horario no puedan reservar ambas (sección 12, verificado end-to-end).
- `status: PENDING`, `payment_status: PENDING`, `expires_at: now + 15 min`
  (sección 10). El pago y la confirmación llegan en Fase 4.
- `appointment_code` único por negocio (formato `APT-XXXXXXXX`), con
  reintento automático ante colisión.

Respuestas:

- `201` con la reserva creada (incluye `customer` y `service`).
- `400 VALIDATION_ERROR` si el body es inválido.
- `404 NOT_FOUND` si el negocio o el servicio no existen.
- `409 AVAILABILITY_ERROR` — "Lo sentimos, no tenemos disponibilidad para ese
  horario." — si el horario está fuera de `business_hours`, ya pasó, o ya
  alcanzó la `capacity` del servicio.

### `POST /internal/jobs/expire-appointments`

Endpoint interno (no público) que marca como `EXPIRED` las reservas `PENDING`
cuyo `expires_at` ya venció. Lo dispara el scheduler in-process cada 5 minutos
(`src/jobs/scheduler.ts`, Fase 9 — ver "Rol de n8n" en `docs/ARCHITECTURE.md`
para por qué no hay un cron externo).

- Requiere header `Authorization: Bearer <INTERNAL_JOBS_TOKEN>`.
- `401 UNAUTHORIZED` si falta o no coincide el token.
- `200 { "data": { "expiredCount": number } }`.

## Fase 4 — Payment Integration

Ver `docs/PAYMENTS.md` para el detalle de la abstracción `PaymentProvider`, el
adapter de Wompi y las reglas de idempotencia/validación del webhook.

### `POST /api/payments/create`

Genera (o reutiliza) el link de pago de una reserva `PENDING`.

Body:

```json
{ "entityType": "APPOINTMENT", "entityId": "uuid" }
```

- `entityType: "GIFT_CARD"` también soportado desde Fase 8 — mismo endpoint,
  `entityId` es el `id` de la Gift Card.
- `400 VALIDATION_ERROR` si el body es inválido, la reserva/Gift Card ya no
  está `PENDING`, o ya expiró.
- `404 NOT_FOUND` si la reserva/Gift Card o el negocio no existen.
- `201`:

```json
{ "data": { "paymentUrl": "https://checkout.wompi.co/p/...", "reference": "PAY-XXXXXXXX" } }
```

### `POST /api/webhooks/payment`

Único punto que puede confirmar un pago (sección 9 — nunca se confía en el
frontend). Verifica la firma del proveedor, valida referencia/monto/moneda,
actualiza el `payment` y confirma la reserva asociada de forma idempotente.

- Siempre responde `200 { "received": true }` si el payload trae una firma
  válida (incluso si la referencia no existe o el evento ya se procesó antes),
  para que el proveedor no reintente innecesariamente.
- `401 WEBHOOK_VERIFICATION_ERROR` si la firma no es válida.
- `402 PAYMENT_ERROR` si el monto o la moneda no coinciden con lo esperado.

## Fase 5 — Web Booking

### `GET /api/appointments/status?reference=PAY-XXXXXXXX`

Usado por `/gracias` para mostrar el resultado tras volver del checkout. No
requiere login (sección 13) — la referencia es un código corto no adivinable,
igual que `appointment_code`.

- `404 NOT_FOUND` si no existe una reserva con esa referencia de pago.
- `200`:

```json
{
  "data": {
    "appointmentCode": "APT-XXXXXXXX",
    "status": "CONFIRMED",
    "paymentStatus": "PAID",
    "serviceName": "Masaje relajante",
    "date": "2026-01-05",
    "startTime": "10:00",
    "endTime": "11:00",
    "price": "90000"
  }
}
```

### Páginas

- `GET /reservar[?negocio=<slug>]` — formulario de reserva en 5 pasos
  (servicio → fecha → hora → datos → pago). `negocio` por defecto es
  `demo-spa`; en un negocio real se fija por dominio/enlace, no hay selector
  de negocio en la UI (MVP de un solo tenant activo, arquitectura ya
  multi-tenant — sección 5).
- `GET /gracias?ref=<payment.reference>` — sondea `GET
  /api/appointments/status` cada 3s (máx. 10 intentos) mientras el webhook de
  pago confirma la reserva de forma asíncrona.

## Fase 6 — WhatsApp

Ver `docs/WHATSAPP.md` para el detalle de la máquina de estados, cómo se
resuelve el negocio por número de WhatsApp, y por qué la URL usa `/api/`
(la sección 17 y la sección 23 del prompt maestro no coinciden entre sí).

### `GET /api/webhooks/whatsapp`

Handshake de verificación de Meta. Query params `hub.mode`, `hub.verify_token`,
`hub.challenge`.

- `200` con `hub.challenge` como texto plano si `hub.mode=subscribe` y
  `hub.verify_token` coincide con `WHATSAPP_VERIFY_TOKEN`.
- `403` en cualquier otro caso.

### `POST /api/webhooks/whatsapp`

Mensajes entrantes. Valida `X-Hub-Signature-256` antes de procesar; siempre
responde `200` si la firma es válida, para que Meta no reintente.

- `401 WEBHOOK_VERIFICATION_ERROR` si la firma no es válida (y hay
  `WHATSAPP_APP_SECRET` configurado — ver docs/WHATSAPP.md).

### Embedded Signup de WhatsApp (público, sin sesión)

Las dos únicas rutas del flujo sin autenticación: las abre el dueño del spa con
el enlace que le mandó el operador. La autorización es el token del enlace, y su
poder es exactamente uno: conectar **un** número a **un** negocio. Límite de tasa
propio, 20/min. Ver docs/PANEL-OPERADOR.md §7.4.

#### `GET /api/whatsapp/signup/:token`

Portada del enlace: `businessName`, `status`, `expiresAt`, `unavailableReason`
(texto listo para mostrar cuando ya no sirve) y la config pública del popup.

- `400` si el token no tiene la forma esperada (no se consulta la base).
- `404` si no existe **o** si venció — a propósito responden igual, para no
  volver el endpoint un oráculo de tokens válidos.

#### `POST /api/whatsapp/signup/:token`

Body: `code`, `wabaId`, `phoneNumberId`, `businessPortfolioId?`. Canjea el
código, suscribe la app a la WABA, registra el número en Cloud API y devuelve
`{ account, steps }`.

- `400` si el enlace ya se usó, fue cancelado o venció.
- `400` si ese `phone_number_id` ya pertenece a otro negocio.
- `502 META_GRAPH_ERROR` si Meta rechaza alguno de los pasos. El enlace **sigue
  sirviendo**: el motivo queda en `last_error` y se puede reintentar.

### `GET /conectar/:token`

La página que abre el cliente (HTML estático del backend, como `/reservar`).
Lleva una CSP propia, ampliada solo con los orígenes de Facebook.

## Fase 8 — Gift Cards

Ver `docs/GIFT-CARDS.md` para el detalle del flujo completo (creación → pago
→ imagen con Puppeteer → Storage → WhatsApp), la decisión de generar el
código al crear (no al pagar), y por qué `redeemGiftCard` falla cerrado sin
`STAFF_PIN`.

### `POST /api/gift-cards`

Crea una Gift Card `PENDING`, con su código único ya asignado. El pago se
inicia después con `POST /api/payments/create` (`entityType: "GIFT_CARD"`,
ver Fase 4 arriba).

Body:

```json
{
  "businessId": "uuid",
  "serviceId": "uuid",
  "design": "clasico | floral | elegante",
  "buyerName": "Laura Gómez",
  "buyerPhone": "+573001112233",
  "buyerEmail": "opcional@example.com",
  "recipientName": "Marcela Ruiz",
  "recipientPhone": "opcional",
  "message": "opcional, máx 500 caracteres",
  "scheduledDate": "opcional, YYYY-MM-DD"
}
```

- `400 VALIDATION_ERROR` si el body es inválido.
- `404 NOT_FOUND` si el negocio o el servicio no existen.
- `201` con la Gift Card creada.

### `GET /api/gift-cards/status?reference=PAY-XXXXXXXX`

Usado por `/gracias?type=gift` para hacer polling tras volver del checkout —
mismo patrón que `GET /api/appointments/status` (Fase 5).

- `404 NOT_FOUND` si no existe una Gift Card con esa referencia de pago.
- `200`:

```json
{
  "data": {
    "code": "GIFT-XXXXXXXX",
    "status": "PAID",
    "paymentStatus": "PAID",
    "serviceName": "Manicure",
    "recipientName": "Marcela Ruiz",
    "amount": "35000",
    "pdfUrl": "https://.../storage/v1/object/public/gift-cards/.../GIFT-XXXXXXXX.png"
  }
}
```

`pdfUrl` puede ser `null` incluso con `status: PAID` — la imagen se genera
después de confirmar el pago, no en el mismo instante (ver "Timing conocido"
en `docs/GIFT-CARDS.md`).

### `POST /api/gift-cards/validate`

Consulta pública (usado por `/validar`), no requiere `STAFF_PIN`.

Body: `{ "code": "GIFT-XXXXXXXX" }`

- `404 NOT_FOUND` si no existe una Gift Card con ese código.
- `200` con `valid: boolean` — `false` si está `PENDING`, `REDEEMED`,
  cancelada o expirada.

### `POST /api/gift-cards/redeem`

Canje atómico, protegido por `STAFF_PIN` (uso interno vía `/validar`).

Body: `{ "code": "GIFT-XXXXXXXX", "staffPin": "1234" }`

- `401 UNAUTHORIZED` si `STAFF_PIN` no está configurado en el entorno, o si
  `staffPin` no coincide.
- `404 NOT_FOUND` si no existe una Gift Card con ese código.
- `409` (`GIFT_CARD_ALREADY_REDEEMED`) si ya fue canjeada.
- `400 VALIDATION_ERROR` si expiró o todavía no está pagada.
- `200 { "data": { "redeemed": true } }` si el canje fue exitoso.

### Páginas

- `GET /regalar[?negocio=<slug>]` — formulario de compra en 5 pasos
  (experiencia → diseño → comprador → destinatario → resumen/pago).
- `GET /gracias?type=gift&ref=<payment.reference>` — variante de `/gracias`
  para Gift Cards (mismo componente, rama distinta en `web/js/gracias.js`).
- `GET /validar` — uso interno: consultar código → canjear con `STAFF_PIN`.

## Fase 9 — Reminders

Ver "Rol de n8n" en `docs/ARCHITECTURE.md` para la decisión de no usar un
orquestador externo: `src/jobs/scheduler.ts` corre ambos jobs in-process con
`node-cron`, llamando a estos mismos endpoints internos.

### `POST /internal/jobs/send-reminders`

Endpoint interno (no público). Busca citas `CONFIRMED` cuyo inicio real cae
dentro de la ventana de ~24h antes (`REMINDER_HOURS_BEFORE` /
`REMINDER_WINDOW_MINUTES`, sección 21) y envía el recordatorio por WhatsApp a
cada cliente. Lo dispara el scheduler cada hora; la idempotencia (no
duplicar recordatorios entre corridas con ventanas solapadas) la da
`notification_log` (tipo `APPOINTMENT_REMINDER`), no la ventana de tiempo.

- Requiere header `Authorization: Bearer <INTERNAL_JOBS_TOKEN>`.
- `401 UNAUTHORIZED` si falta o no coincide el token.
- `200 { "data": { "remindersSent": number } }`.

## Panel de operador — `/admin/*`

Superficie del panel (`apps/panel`, ver `docs/PANEL-OPERADOR.md` §8). Todas
comparten las mismas reglas:

- **Auth**: sesión de Better Auth validada en **cada** request
  (`requireOperatorSession`), por cookie o `Authorization: Bearer`. `401` sin
  sesión. Solo se montan si `BETTER_AUTH_SECRET` está configurada.
- **Envoltorio**: `{ "data": ... }`, igual que el resto de la API.
- **Paginación**: `?page&pageSize&sort&order&q` en todos los listados; la
  respuesta es `{ items, page, pageSize, total, totalPages }`. Se pagina en
  Postgres, no en el panel (D10).
- **Montos**: números (no strings), en la moneda que indica cada recurso.
- **Fechas de calendario**: `YYYY-MM-DD` (vigencias, períodos, fechas de cita).
  Los timestamps van en ISO completo.
- **Secretos**: entran completos, salen **siempre** enmascarados (`••••1234`).

### Negocios

| Ruta | Qué hace |
|---|---|
| `GET /admin/me` | quién es el operador de la sesión |
| `GET /admin/businesses` | listado paginado, `q` busca por nombre o slug |
| `POST /admin/businesses` | alta; nace en `TRIAL` y crea su `Organization` espejo → `201` |
| `GET`/`PATCH /admin/businesses/:id` | detalle y edición |
| `POST /admin/businesses/:id/status` | transición de estado — body `{ status, reason }`. Valida la máquina de estados (§5) y exige motivo; `TRIAL → ACTIVE` se rechaza aquí (va por el onboarding) |
| `GET`/`PATCH /admin/businesses/:id/branding` | logo, colores y persona del agente |
| `GET`/`PATCH /admin/businesses/:id/onboarding` | checklist derivado de la data + marcas manuales |
| `POST /admin/businesses/:id/activate` | `TRIAL → ACTIVE`; revalida el checklist completo en el servidor |
| `GET`/`POST /admin/businesses/:id/contacts` · `PATCH`/`DELETE .../contacts/:contactId` | contactos del dueño (CRM) |
| `GET`/`POST /admin/businesses/:id/services` · `PATCH`/`DELETE .../services/:serviceId` | catálogo de servicios (incluye pausados, con `appointmentsCount`). `PATCH` es parcial (`{ active: false }` pausa). `DELETE` → `409` si el servicio tiene citas: se pausa en vez de borrarse |
| `GET`/`PUT /admin/businesses/:id/hours` | horario semanal. `GET` devuelve siempre los 7 días (0 = domingo; sin fila = cerrado). `PUT { days: [{ dayOfWeek, openTime, closeTime, active }] }` hace upsert por día en una transacción; cierre > apertura, sin cruzar medianoche |

### Suscripción y cartera

| Ruta | Qué hace |
|---|---|
| `GET /admin/businesses/:id/subscription` | `{ plan, suggested }` — `suggested` trae los defaults (D8) cuando aún no hay plan |
| `PUT /admin/businesses/:id/subscription` | crea o reemplaza el plan |
| `POST /admin/businesses/:id/subscription/extend` | corre `validUntil` sin cobrar — `{ days, reason? }`. Si el plan venció, cuenta desde hoy |
| `GET /admin/businesses/:id/billing` | resumen: plan, pendientes, últimas cuentas y pagos |
| `GET /admin/businesses/:id/invoices/outstanding` | cuentas sin pagar de ese negocio |
| `POST /admin/businesses/:id/invoices` | emite una cuenta → `201`. Sin `items` la arma del plan (cobra el ciclo siguiente); sin plan y sin `items`, `400` |
| `POST /admin/businesses/:id/payments` | registra un pago → `201`. En una transacción: salda las cuentas indicadas, extiende `validUntil` y reactiva al negocio en mora o suspendido |
| `GET /admin/invoices` | listado global; filtros `status`, `businessId`, `outstanding` |
| `GET /admin/invoices/:id` | detalle con líneas y pagos aplicados |
| `POST /admin/invoices/:id/status` | `{ action: "send" \| "void", reason? }` |
| `POST /admin/invoices/:id/pdf` · `POST /admin/payments/:id/pdf` | genera el PDF (Puppeteer → Storage) y devuelve `{ pdfUrl }` |
| `GET /admin/payments` | pagos recibidos, filtrables por `businessId` |
| `POST /admin/billing/run` | corrida manual del ciclo diario; devuelve qué emitió, venció y suspendió |

### Métricas, consumo y actividad

| Ruta | Qué hace |
|---|---|
| `GET /admin/metrics/overview?days=30` | cartera del operador (MRR, cobrado del mes y del anterior, pendiente, vencido), clientes por estado, próximos vencimientos y consumo agregado |
| `GET /admin/businesses/:id/usage?days=30` | consumo de un cliente: citas por estado y canal, volumen transaccionado, abonos, conversaciones, gift cards, serie diaria y top de servicios |
| `GET /admin/businesses/:id/appointments` | citas; filtros `from`, `to`, `status`, `q` |
| `GET /admin/businesses/:id/transactions` | pagos **del negocio** (los de sus clientas). Se llama así para no confundirlo con `/admin/payments`, que son los pagos que el operador recibe |
| `GET /admin/businesses/:id/conversations` | estado de la máquina del bot de menús por número (`whatsapp_conversations`), sin mensajes |
| `GET /admin/businesses/:id/chats` | transcripción de WhatsApp: un hilo por número, el más reciente primero; `q` busca por teléfono, nombre de perfil o nombre de clienta |
| `GET /admin/businesses/:id/chats/:phone` | mensajes del hilo (`phone` solo dígitos), 100 por página del más viejo al más nuevo; `?before=<ISO>` trae los anteriores (`nextBefore`) |
| `GET /admin/businesses/:id/gift-cards` | gift cards del negocio |
| `GET /admin/audit-logs` | bitácora; `action` filtra por **prefijo** (`business.`, `billing.`…) |

### Integraciones por negocio

| Ruta | Qué hace |
|---|---|
| `GET /admin/businesses/:id/whatsapp` | números conectados, con el token enmascarado |
| `POST /admin/businesses/:id/whatsapp` | conecta un número → `201`. Reconectar el mismo `phone_number_id` rota su token; si pertenece a otro negocio, `400` |
| `PATCH /admin/businesses/:id/whatsapp/:accountId` | nombre visible, número visible, `active`, o rotar el token |
| `DELETE /admin/businesses/:id/whatsapp/:accountId` | desconecta → `204` |
| `POST /admin/businesses/:id/whatsapp/:accountId/verify` | consulta la Graph API y persiste calidad y tier de mensajería. Un fallo de Meta vuelve como `{ ok: false, detail }`, no como error HTTP |
| `GET /admin/whatsapp/embedded-signup` | si el Embedded Signup está habilitado en este despliegue (`enabled`, `appId`, `configId`, `graphVersion`). Con `enabled: false` el panel oculta el botón de Facebook — docs/PANEL-OPERADOR.md §7.4 |
| `GET /admin/businesses/:id/whatsapp/signup-links` | enlaces de auto-conexión del negocio. `url` siempre viene `null`: de la base solo se puede recuperar el hash del token |
| `POST /admin/businesses/:id/whatsapp/signup-links` | genera un enlace de un solo uso → `201`. **La `url` con el token viene solo en esta respuesta.** Revoca los pendientes del negocio |
| `DELETE /admin/businesses/:id/whatsapp/signup-links/:sessionId` | cancela un enlace pendiente → `204` |
| `POST /admin/businesses/:id/whatsapp/embedded-signup` | completa el signup con el `code` del popup abierto en el panel → `201` con `{ account, steps }` |
| `GET /admin/businesses/:id/payment-credentials` | estado de las llaves de Wompi; `usingGlobalFallback: true` cuando el negocio todavía cobra con las del operador |
| `PUT /admin/businesses/:id/payment-credentials` | guarda las 4 llaves cifradas |
| `DELETE /admin/businesses/:id/payment-credentials` | vuelve al fallback global |

### `POST /internal/jobs/billing-cycle`

Endpoint interno (no público, `Authorization: Bearer <INTERNAL_JOBS_TOKEN>`).
Corre el ciclo de facturación: emite las cuentas del próximo período 5 días
antes del vencimiento, marca `OVERDUE` las enviadas que ya vencieron, pasa los
negocios a `PAST_DUE` y los suspende al agotarse la gracia. Lo dispara el
scheduler a las 6:00 de `APP_TIMEZONE`; es idempotente, así que repetirlo el
mismo día no duplica nada.

- `200 { "data": { runDate, invoicesCreated, invoicesOverdue, businessesPastDue, businessesSuspended, notes } }`.
