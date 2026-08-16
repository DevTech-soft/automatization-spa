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
