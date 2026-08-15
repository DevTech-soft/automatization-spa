# Pagos

Fase 4 del roadmap. Ver `docs/ARCHITECTURE.md` (sección "Pagos") para el porqué
de las decisiones y `src/integrations/payments/` para el código.

## Principio (sección 9 del prompt maestro)

La única fuente válida para confirmar un pago es el **webhook verificado del
proveedor**. Nunca se confía en el frontend, en query params, ni en un botón
"ya pagué". `POST /api/webhooks/payment` es la única ruta que puede mover un
`payment` a `PAID` y, en consecuencia, una reserva a `CONFIRMED`.

## Abstracción `PaymentProvider`

`src/integrations/payments/PaymentProvider.ts` define la interfaz que usa el
resto de la aplicación:

- `createPayment(input)` — genera el link de pago.
- `validateWebhook(rawPayload)` — valida la firma/checksum del proveedor.
- `parseWebhook(rawPayload)` — normaliza el payload a `WebhookEvent`. Solo debe
  llamarse después de que `validateWebhook` devuelva `true`.

`src/integrations/payments/index.ts` (`getPaymentProvider()`) instancia el
adapter según `PAYMENT_PROVIDER`. Ningún otro archivo debe importar
`WompiPaymentProvider` directamente — así cambiar de proveedor implica escribir
un adapter nuevo, no tocar `payment.service.ts` (sección 25 y 47).

## Adapter: Wompi

`WompiPaymentProvider` usa el **Web Checkout** de Wompi (redirección firmada),
no la API transaccional server-to-server — evita llamadas salientes
adicionales y simplifica el MVP (decisión de Fase 0, pendiente de confirmar
con el primer cliente real; cambiar a Mercado Pago requiere un nuevo adapter).

Variables requeridas (ver `.env.example`):

- `PAYMENT_PUBLIC_KEY` — llave pública, va en la URL del checkout.
- `PAYMENT_INTEGRITY_SECRET` — firma la integridad del checkout
  (`signature:integrity` = `sha256(reference + amountInCents + currency + secret)`).
- `PAYMENT_WEBHOOK_SECRET` — el "secreto de eventos" de Wompi, valida la firma
  de los webhooks entrantes.

### Verificación de firma del webhook

Wompi envía `signature.properties` (lista de paths dentro de `data`, ej.
`["transaction.id", "transaction.status", "transaction.amount_in_cents"]`),
`signature.checksum` y `timestamp`. El checksum esperado se calcula como:

```
sha256(concat(valores en signature.properties) + timestamp + eventsSecret)
```

y se compara con `timingSafeEqual` contra el checksum recibido (protección
contra timing attacks). Un payload que no matchea el schema de Wompi o cuyo
checksum no coincide se rechaza con `WebhookVerificationError` **antes** de
tocar la base de datos.

## Flujo de creación de payment

`POST /api/payments/create` (`entityType: "APPOINTMENT" | "GIFT_CARD"`,
`entityId`):

1. Solo soporta `APPOINTMENT` por ahora — `GIFT_CARD` se implementa en Fase 8.
2. La reserva debe existir, estar `PENDING` y no haber expirado
   (`expires_at`), si no responde `404`/`400`.
3. Si la reserva ya tiene un `payment_reference` con un `payment` `PENDING`
   asociado, se reutiliza esa referencia (regenera el link, no crea una fila
   `payments` nueva) — evita huérfanos si el cliente hace click en "pagar" más
   de una vez.
4. Si no, genera una referencia nueva (`generateCode("PAY")`), crea el
   `payment` en estado `PENDING` y guarda la referencia en el `appointment`,
   dentro de la misma transacción.

## Flujo del webhook (`POST /api/webhooks/payment`)

Todo ocurre dentro de una única transacción de Prisma, con
`pg_advisory_xact_lock(hashtext(reference))` para serializar entregas
concurrentes/duplicadas del mismo evento (dos workers de n8n, reintento del
proveedor, etc.):

1. `validateWebhook` — firma inválida → `WebhookVerificationError` (`400`), el
   proveedor puede reintentar y para entonces la firma seguirá siendo
   inválida a propósito si el payload fue manipulado.
2. `parseWebhook` → `WebhookEvent` normalizado.
3. Referencia desconocida → se ignora (log `payment_webhook_unknown_reference`),
   responde `200` igualmente (nunca hacer que el proveedor reintente algo que
   nunca va a encontrar).
4. **Idempotencia**: si el `payment` ya está en un estado terminal (`PAID`,
   `FAILED`, `REFUNDED`), se ignora — un webhook duplicado o un replay no
   vuelve a confirmar ni a notificar.
5. **Validación de monto/moneda**: el monto (en centavos, para evitar errores
   de precisión de punto flotante) y la moneda del evento deben coincidir
   exactamente con los del `payment` guardado, si no `PaymentError` (`402`).
   Esto evita que un webhook con el `reference` correcto pero manipulado
   confirme un pago por menos de lo debido.
6. Actualiza `payment.status` (`APPROVED` → `PAID`, `DECLINED`/`ERROR`/`VOIDED`
   → `FAILED`, `PENDING` → no-op) y guarda `transaction_id` + `raw_response`.
7. Si quedó `PAID` y `entity_type = APPOINTMENT`, confirma la reserva (ver
   abajo). `GIFT_CARD` se implementa en Fase 8.

### Confirmación de la reserva

`confirmAppointmentAfterPayment` reutiliza el mismo
`pg_advisory_xact_lock(business_id, service_id, appointment_date)` que la
creación de reservas (sección 12), porque el trigger de capacity de Postgres
por sí solo no serializa transacciones concurrentes bajo `READ COMMITTED`:

- `confirmIfPending` solo pasa de `PENDING`/`EXPIRED` a `CONFIRMED` —
  idempotente ante reprocesos del mismo webhook.
- Si el trigger `check_appointment_capacity` rechaza la confirmación (el slot
  se llenó con otra reserva mientras esta esperaba el pago — caso límite raro
  pero posible), la reserva **no** se pierde: se marca `payment_status: PAID`
  con una nota `"...requiere revisión manual"` en `notes`, en vez de perder el
  pago del cliente. No hay reembolso automático en el MVP — es un caso para
  atender manualmente por el negocio.

## Probar contra el sandbox real de Wompi

Verificado end-to-end contra el sandbox de Wompi (llaves de prueba reales):
`POST /api/payments/create` genera un link de checkout válido —
`https://checkout.wompi.co/p/` lo acepta y muestra el monto/comercio
correctos en "modo de pruebas".

**Con `APP_URL=http://localhost:3000` el checkout no carga**: el CDN de
Wompi (CloudFront) devuelve `403 Request blocked` en cuanto `redirect-url`
apunta a `localhost` — es una protección anti-SSRF/open-redirect de su WAF,
no un bug de esta app ni de la firma. Confirmado aislando el parámetro: la
misma URL con `redirect-url=https://ejemplo.com/...` carga sin problema.

Para probar el flujo completo (pagar → volver a `/gracias` → webhook) en
local, expón el backend con un túnel público (ej. `ngrok http 3000`) y usa
esa URL pública como `APP_URL` mientras pruebas — no hace falta para el
resto del desarrollo, solo para ejercitar el checkout real de Wompi.

## Qué falta (fuera de Fase 4)

- `MercadoPagoPaymentProvider` — no implementado (Fase 0: Wompi es el default).
- Pago de Gift Cards (`entityType: "GIFT_CARD"`) — Fase 8.
- Notificación por WhatsApp al confirmar — Fase 6/9.
- Sincronización a Google Sheets tras el pago — Fase 7.
