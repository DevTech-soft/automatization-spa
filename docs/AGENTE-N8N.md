# Agente conversacional en n8n

Reemplaza el bot determinístico de menús (`whatsapp-conversation.service.ts`,
sección 18) por un agente conversacional, **sin mover el sistema de registro**:
las reservas, la disponibilidad y los pagos siguen viviendo en este backend.

n8n aporta la conversación. Este backend aporta la verdad.

## Por qué el webhook no se mueve a n8n

Meta permite **un solo webhook por app**. Si n8n lo tomara, el bot actual
quedaría desconectado de golpe y habría que reimplementar allí la validación de
`X-Hub-Signature-256`, el parseo del payload de Meta y la resolución del tenant.

En vez de eso, el webhook sigue en `POST /api/webhooks/whatsapp` y
`handleIncomingWhatsAppMessage` reenvía a n8n el mensaje **ya parseado y con el
negocio resuelto**. Consecuencias:

- El agente recibe un `businessId` real (UUID), no un `phone_number_id` que
  tendría que volver a mapear.
- La migración es por negocio, con `business.settings.agentEnabled`.
- Si n8n no responde, `forwardToAgent` devuelve `false` y el mensaje cae al bot
  de menús. Una caída de n8n degrada la conversación; no la corta.

## Por qué el agente llama a la API y no a Postgres

`createAppointment` toma un `pg_advisory_xact_lock`, recuenta solapes dentro de
la transacción, respeta `service.capacity` y crea el hold de
`PENDING_EXPIRATION_MINUTES`. Un agente escribiendo directo en la tabla se salta
todo eso y sobrevende cupos. Por eso las herramientas son HTTP.

Y en sentido contrario: n8n **no** habla con la API de Meta. `WhatsAppProvider.ts`
establece que ningún módulo fuera de la capa de integración lo haga, así que el
agente redacta el texto y lo entrega a `POST /internal/agent/reply` para que el
backend lo envíe.

## Flujo de un mensaje

```
Meta ──▶ POST /api/webhooks/whatsapp        (firma validada, tenant resuelto)
          │
          ├─ settings.agentEnabled != true ──▶ bot de menús (sin cambios)
          │
          └─ true ──▶ POST $N8N_AGENT_WEBHOOK_URL   (X-Agent-Token)
                        │
                        ▼
                      Agente n8n
                        │  herramientas (Bearer $N8N_AGENT_TOKEN)
                        ├─ GET  /internal/agent/services
                        ├─ GET  /internal/agent/availability
                        ├─ GET  /internal/agent/appointments
                        ├─ POST /internal/agent/appointments
                        │
                        └─ POST /internal/agent/reply ──▶ Meta (vía provider)
```

## Payload que recibe n8n

```json
{
  "businessId": "uuid",
  "businessName": "Studio Bella",
  "timezone": "America/Bogota",
  "currency": "COP",
  "phone": "573001234567",
  "contactName": "Jose",
  "text": "hola, quiero reservar",
  "agent": { "nombreAgente": "Valentina", "politicaAbono": "..." }
}
```

El objeto `agent` sale de `business.settings.agent` y alimenta el system prompt.
Es texto libre por negocio: no requiere migración para agregarle campos.

## Herramientas

Todas bajo `/internal/agent/*`, protegidas por `requireAgentToken`
(`N8N_AGENT_TOKEN`, o `INTERNAL_JOBS_TOKEN` si aquel no está definido). En
Railway se llaman por la red privada, así que nunca salen a internet.

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/internal/agent/services?businessId` | catálogo activo con precio y duración |
| GET | `/internal/agent/availability?businessId&serviceId&date` | `horasLibres: ["09:00", …]` |
| GET | `/internal/agent/appointments?businessId&phone` | reservas vigentes del cliente |
| POST | `/internal/agent/appointments` | crea la reserva **y** el link de pago |
| POST | `/internal/agent/reply` | envía el texto por WhatsApp |

`POST /internal/agent/appointments` devuelve **200 incluso cuando no pudo
reservar**, con `{ creada: false, motivo }`. Un slot ocupado o una fecha pasada
son información para la conversación, no fallos de la herramienta: así el agente
lee el motivo y ofrece otra hora en lugar de disculparse por un error técnico.

## Configuración

Backend (`.env`):

```
N8N_AGENT_WEBHOOK_URL=http://n8n.railway.internal:5678/webhook/agente-reservas
N8N_AGENT_TOKEN=<mismo secreto que en n8n>
N8N_AGENT_TIMEOUT_MS=20000
```

Activar un negocio (columna `businesses.settings`):

```json
{
  "agentEnabled": true,
  "agent": {
    "nombreAgente": "Valentina",
    "tipoNegocio": "spa de uñas y estética",
    "horarioTexto": "Lunes a viernes 9:00-19:00, sábados 9:00-17:00",
    "politicaAbono": "Acrílicas y pestañas requieren abono para separar el cupo",
    "politicaCancelacion": "Cancelación gratis hasta 12 horas antes",
    "metodosPago": "Efectivo, Nequi, Daviplata y tarjeta",
    "nombreEncargada": "Marcela"
  }
}
```

Desactivarlo es poner `agentEnabled: false`: el negocio vuelve al bot de menús
en el siguiente mensaje, sin desplegar nada.

## Despliegue de n8n en Railway

En el **mismo proyecto** que este backend, para que se hablen por red privada:

1. `New -> Database -> PostgreSQL` (base propia de n8n, separada de la del spa).
2. `New -> Docker Image -> n8nio/n8n:latest`.
3. Variables del servicio n8n:

```
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=${{Postgres.PGHOST}}
DB_POSTGRESDB_PORT=${{Postgres.PGPORT}}
DB_POSTGRESDB_DATABASE=${{Postgres.PGDATABASE}}
DB_POSTGRESDB_USER=${{Postgres.PGUSER}}
DB_POSTGRESDB_PASSWORD=${{Postgres.PGPASSWORD}}
N8N_ENCRYPTION_KEY=<cadena aleatoria fija - si cambia se pierden las credenciales>
N8N_HOST=<dominio>.up.railway.app
N8N_PROTOCOL=https
N8N_PORT=5678
WEBHOOK_URL=https://<dominio>.up.railway.app/
N8N_EDITOR_BASE_URL=https://<dominio>.up.railway.app/
GENERIC_TIMEZONE=America/Bogota
TZ=America/Bogota
N8N_RUNNERS_ENABLED=true
```

`WEBHOOK_URL` no es opcional: sin ella n8n arma las URLs de webhook con
`localhost`.

**La red privada de Railway es IPv6.** Por eso `server.ts` escucha en `::` y no
en `0.0.0.0`; con IPv4 solamente, las llamadas de n8n a
`http://spa-mvp.railway.internal:3000` fallan con `ECONNREFUSED`.

## Memoria de la conversación

Usar **Postgres Chat Memory** apuntando a la base de n8n, con
`sessionKey = {{businessId}}:{{phone}}`. El buffer en memoria se pierde en cada
redeploy y deja conversaciones a medias sin contexto.
