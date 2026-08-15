# WhatsApp

Fase 6 del roadmap. Ver `docs/ARCHITECTURE.md` para el porqué de las
decisiones y `src/integrations/whatsapp/` + `src/services/whatsapp-conversation.service.ts`
para el código.

## Principio (sección 18 del prompt maestro)

El bot es **determinístico**, no usa un LLM. Toda la conversación es una
máquina de estados explícita (`ConversationState` en `prisma/schema.prisma`)
persistida en `whatsapp_conversations`, una fila por `(business_id, phone)`:

```
SELECTING_SERVICE → SELECTING_DATE → SELECTING_TIME → COLLECTING_NAME
  → COLLECTING_PHONE (automático) → WAITING_PAYMENT → CONFIRMED
```

`CANCELLED` es alcanzable desde cualquier estado escribiendo "cancelar".
Al llegar a `CONFIRMED`/`CANCELLED`, el siguiente mensaje del cliente reinicia
la conversación desde `SELECTING_SERVICE` (Fase 6 no soporta "editar" una
reserva en curso — solo cancelar y empezar de nuevo).

`COLLECTING_PHONE` existe en el enum por fidelidad con la sección 18, pero en
el canal WhatsApp el teléfono ya se conoce (es el remitente) — se resuelve
automáticamente en el mismo turno que `COLLECTING_NAME`, sin esperar una
respuesta del cliente.

## Multi-tenancy: cómo se resuelve el negocio

Cada mensaje entrante de Meta incluye `metadata.display_phone_number` — el
número de WhatsApp que **recibió** el mensaje. Se compara (solo dígitos)
contra `businesses.whatsapp_number` (`business.repository.ts#findByWhatsAppNumber`)
para saber a qué negocio pertenece la conversación. Esto es lo que permite que
la arquitectura soporte múltiples negocios sin cambios: cada uno con su propio
número de WhatsApp Business, sin necesitar un "negocio por defecto" como sí
hace `/reservar` (que no tiene una señal equivalente al cargar la página, ver
`docs/API.md`).

Si el número no coincide con ningún negocio, el mensaje se ignora
silenciosamente (log `whatsapp_message_unknown_business_number`) — no hay
nada razonable que responder.

## Endpoint

`GET|POST /api/webhooks/whatsapp` — la sección 17 del prompt maestro dice
`POST /webhooks/whatsapp` y la sección 23 dice `POST /api/webhooks/whatsapp`;
se resolvió la ambigüedad a favor de `/api/webhooks/whatsapp` por consistencia
con el webhook de pagos ya existente (`POST /api/webhooks/payment`).

- `GET`: handshake que Meta dispara al configurar la URL del webhook. Compara
  `hub.verify_token` contra `WHATSAPP_VERIFY_TOKEN` y responde `hub.challenge`
  como texto plano si coincide, `403` si no.
- `POST`: mensajes entrantes. Valida `X-Hub-Signature-256` contra
  `WHATSAPP_APP_SECRET` antes de procesar nada (sección 29). Siempre responde
  `200` si la firma es válida — Meta reintenta agresivamente si no.

### Body sin parsear para la firma

`X-Hub-Signature-256` es un HMAC-SHA256 sobre los **bytes exactos** del body,
no sobre el JSON re-serializado (que puede diferir en espacios/orden de
claves). `app.ts` reemplaza el content-type parser de JSON por defecto de
Fastify para conservar el string crudo en `request.rawBody` antes de
parsearlo — ver el comentario ahí.

## `WHATSAPP_APP_SECRET`: no está en la sección 38

El prompt maestro (sección 38) no lista un app secret entre las variables de
entorno. Se agregó igual en Fase 6 porque sin él no hay forma de validar que
un webhook realmente viene de Meta (sección 29: "validación de webhooks").
Si no está configurado, `MetaWhatsAppProvider.validateWebhookSignature`
**permite el paso** (con `logger.warn`) en vez de bloquear todo el canal — una
elección deliberada para no bloquear desarrollo local antes de tener un app
de Meta configurada, pero es una brecha real: **configúralo antes de
producción**.

## Abstracción `WhatsAppProvider`

`src/integrations/whatsapp/WhatsAppProvider.ts` (sección 26):
`sendText`, `sendTemplate`, `sendInteractiveMessage` (listas o botones),
`sendDocument` (reservado para Gift Cards, Fase 8), `parseIncomingMessage`,
`validateWebhookSignature`. `MetaWhatsAppProvider` es la única implementación
concreta — cambiar de BSP implica escribir un adapter nuevo, no tocar
`whatsapp-conversation.service.ts` (sección 47).

Los mensajes salientes usan `sendText` (texto libre) en vez de plantillas
aprobadas por Meta. Eso significa que **solo funcionan dentro de la ventana de
sesión de 24 horas** desde el último mensaje del cliente — suficiente para el
flujo de reserva (todo ocurre en minutos), pero los recordatorios de Fase 9
probablemente necesiten una plantilla aprobada si se envían fuera de esa
ventana. Se documenta como pendiente, no se resuelve en Fase 6.

## Notificaciones (sección 22)

`notifyAppointmentConfirmed` (`src/services/notification.service.ts`) se
dispara desde `payment.service.ts` **después** de que la transacción que
confirma el pago hace commit — nunca adentro, para que un fallo de envío de
WhatsApp no pueda revertir una confirmación de pago ya válida. Usa
`notification_log` para idempotencia (sección 32): inserta el registro
*antes* de enviar, así que si el mismo evento se reprocesa, la segunda
llamada encuentra el registro ya creado y no reenvía. Envía dos mensajes
independientes (cliente y negocio); si `business.whatsapp_number` no está
configurado, solo se envía al cliente.

## Qué falta (fuera de Fase 6)

- Plantillas aprobadas por Meta para mensajes fuera de la ventana de 24h
  (recordatorios, Fase 9).
- Envío de Gift Cards por WhatsApp (`sendDocument`, Fase 8).
- Editar una reserva en curso sin cancelar y empezar de nuevo.
- No se probó todavía contra un número de WhatsApp Business real en producción
  (sandbox de Meta sí, ver sección de pruebas más abajo si aplica).
