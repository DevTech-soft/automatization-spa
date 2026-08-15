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
cuyo `expires_at` ya venció. Pensado para que lo dispare el cron de n8n
(workflow `11_cleanup_expired_appointments`, Fase 9).

- Requiere header `Authorization: Bearer <INTERNAL_JOBS_TOKEN>`.
- `401 UNAUTHORIZED` si falta o no coincide el token.
- `200 { "data": { "expiredCount": number } }`.
