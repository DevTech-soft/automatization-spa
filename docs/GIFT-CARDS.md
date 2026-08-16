# Gift Cards

Fase 8 del roadmap. Ver `docs/ARCHITECTURE.md` para el principio general y
`src/services/gift-card.service.ts` + `src/services/gift-card-image.service.ts`
+ `src/integrations/storage/` para el código.

## Flujo (sección 15)

1. `POST /api/gift-cards` (`web/regalar`) crea la Gift Card en `PENDING` con
   su código único ya asignado.
2. `POST /api/payments/create` con `entityType: "GIFT_CARD"` genera el link
   de pago Wompi (mismo `payment.service.ts` que las reservas, sección 9).
3. El webhook de Wompi confirma el pago → `confirmGiftCardPayment` marca
   `status: PAID` dentro de la transacción del webhook (rápido, sin I/O
   externo) → `payment.service.ts` llama a `finalizeGiftCardAfterPayment`
   **fuera** de la transacción y ya con el pago confirmado en firme.
4. `finalizeGiftCardAfterPayment` (fire-and-forget, nunca revierte el pago si
   falla): genera la imagen con Puppeteer → la sube a Supabase Storage → la
   sincroniza a Google Sheets → envía la Gift Card al comprador por WhatsApp
   (`notifyGiftCardCreated`, `status: SENT`).
5. `web/validar` (uso interno, protegido por `STAFF_PIN`) consulta y canjea
   el código.

`web/gracias?type=gift&ref=...` hace polling de `GET /api/gift-cards/status`
(mismo patrón que las reservas en Fase 5) y muestra la imagen si `pdfUrl` ya
está listo — puede llegar antes o después de que termine el polling, ver
"Timing conocido" más abajo.

## Decisión: el código se genera al crear, no después de pagar

La sección 15 sugiere generar el código de la Gift Card después del pago.
Se generó en su lugar **al crear el registro** (`createGiftCard`,
`gift-card.service.ts:52`), igual que `appointment_code` en Fase 2: la
columna `code` es `String @unique NOT NULL` en el schema, así que necesita
un valor desde el primer `INSERT`. Mismo patrón de reintento ante colisión
(`generateCode` + `isUniqueConstraintViolation`, `MAX_CODE_ATTEMPTS = 5`) que
`appointmentCode`/`paymentReference`.

El código existe desde `PENDING`, pero **no es utilizable** hasta que el pago
lo confirme: `validateGiftCard` y `redeemGiftCard` siempre revisan
`status` (`PAID`/`SENT`), nunca solo la existencia del código. Una Gift Card
`PENDING` (pago no completado) consulta como "no válida", igual que una
`EXPIRED`.

## `STAFF_PIN`: falla cerrado, no abierto

`redeemGiftCard` (`gift-card.service.ts:195`) rechaza el canje con
`UnauthorizedError` si `STAFF_PIN` no está configurado en el entorno, en vez
de permitir canjes sin ningún control. Documentado también en
`docs/ARCHITECTURE.md` (sección 7): dejar el canje abierto sin PIN es un
riesgo real (alguien con el código —por ejemplo interceptado en tránsito—
podría canjearlo sin ser staff). La consulta (`validateGiftCard`,
`GET /api/gift-cards/validate`) sí es pública, sin PIN — solo el canje
(`POST /api/gift-cards/redeem`) lo exige.

## Puppeteer: por qué renderizar HTML en vez de una librería de imágenes

`gift-card-image.service.ts` arma la Gift Card como HTML+CSS (`buildHtml`,
cinco diseños en `DESIGNS`: `clasico`, `clasico-puente`, `floral`,
`floral-tulipanes`, `elegante` — ver `config/constants.ts`
`GIFT_CARD_DESIGNS`) y la renderiza a PNG con Puppeteer (`page.setContent` +
`page.screenshot`). Se prefirió sobre una librería de generación de imágenes
(`canvas`, `sharp` + plantillas) para poder reusar CSS real (gradientes,
tipografía, el mismo lenguaje visual del resto del sitio) sin reimplementar
layout en un API de dibujo de bajo nivel.

### Motivos decorativos (rediseño post-Fase 8)

`clasico`/`floral` son pares con un segundo diseño de la misma paleta
(`clasico-puente`, `floral-tulipanes`) y un motivo decorativo distinto — le
da al comprador dos variantes por categoría entre las que elegir. Los
motivos (`src/services/gift-card-motifs.ts`) son SVG a mano, sin assets
externos: una sola primitiva de "pétalo" (un path lente, punta al origen)
reutilizada con `rotate`/`scale`/`translate` arma flores radiales (rosa,
silvestre), flores en abanico (tulipán) y ramas de laurel; la Torre Eiffel y
el puente colgante son siluetas sólidas rellenas (mismo tratamiento visual
que el ícono, no líneas técnicas finas — un primer intento del puente como
arco de líneas delgadas se leía como una regla, no como un puente).
Verificado visualmente renderizando cada diseño con Puppeteer localmente
(`renderGiftCardImage`) y revisando el PNG antes de darlo por bueno — la
suite automática (`tests/unit/gift-card-motifs.test.ts`) solo verifica que
cada diseño devuelve un `<svg>` no vacío, no que se vea bien; eso se valida
a ojo cuando se toque `gift-card-motifs.ts`.

**Frontend (`/regalar`, `web/js/gift-card-preview.js`)**: sin build step no
hay forma de compartir código entre server y frontend (sección 3), así que
el mismo template (paletas + motivos) está **duplicado a propósito** en
JS vanilla — si se cambia un diseño en `gift-card-motifs.ts`, replicar el
cambio ahí. El preview dibuja la tarjeta a tamaño real (1200×630, igual que
el PNG final) y la escala visualmente con `transform: scale()`, en vez de
reimplementar el layout con unidades relativas — garantiza que la
tipografía y el layout sean idénticos al resultado final, no una
aproximación. El paso de diseño se movió a penúltimo (antes de pagar, no
después de elegir servicio) para que el comprador vea la tarjeta ya con el
nombre del destinatario y el mensaje puestos antes de decidir el diseño.

Nota de implementación: `page.setContent` solo acepta
`waitUntil: "load"|"domcontentloaded"` (a diferencia de `page.goto`, que
además acepta `"networkidle0"|"networkidle2"`) — se usa `"load"`, correcto
porque el HTML es inline sin recursos externos que esperar.

## Supabase Storage: bucket público auto-creado, con una trampa real de la API

`SupabaseStorageProvider.ensureBucket` (`src/integrations/storage/`) verifica
si el bucket existe (`GET /storage/v1/bucket/{id}`) y lo crea como público si
no (`POST /storage/v1/bucket`), cacheado en memoria por instancia para no
repetir la verificación en cada upload.

**Encontrado en la prueba en vivo (no en los tests, que mockeaban la API):**
cuando el bucket no existe, Supabase Storage no responde `404` como
documentan la mayoría de ejemplos — responde **HTTP 400** con un body
`{"statusCode":"404","error":"Bucket not found","code":"NoSuchBucket"}`. El
código original solo miraba `check.status === 404`, así que nunca detectaba
el "no existe" y fallaba con "No se pudo verificar el bucket". Corregido:
ahora también trata como "no existe" cualquier respuesta no-OK cuyo body
incluya `"NoSuchBucket"`, sin importar el status HTTP real. Test de
regresión: `tests/unit/storage-provider.test.ts` ("responde 400 con code
NoSuchBucket").

## CSP: `img-src` bloqueaba la imagen en `/gracias`

`@fastify/helmet` (`src/app.ts`) se registra con su Content-Security-Policy
por defecto, que incluye `img-src 'self' data:`. Eso bloqueaba silenciosamente
la carga de la imagen de la Gift Card en `<img src="...">` dentro de
`web/gracias` — cargaba bien navegando a la URL directamente (fuera del CSP
de la página), pero no embebida. Corregido agregando el origen de
`SUPABASE_URL` a `img-src` en la configuración de `helmet`.

## Timing conocido: la imagen puede no estar lista cuando `/gracias` deja de hacer polling

El webhook de pago marca `status: PAID` **antes** de generar la imagen
(Puppeteer + upload ocurren después, fuera de la transacción). Si el
navegador del comprador consulta `/api/gift-cards/status` justo en ese
instante, ve `PAID` y `pollGiftCard` (`web/js/gracias.js`) deja de reintentar
en cuanto ve un estado "confirmado" (`PAID`/`SENT`/`REDEEMED`) — con
`pdfUrl: null` todavía. La página no vuelve a consultar después, así que esa
sesión de navegador nunca muestra la imagen (aunque sí llegue por WhatsApp
segundos después, que es el canal principal de entrega). No es un bug
bloqueante: el mensaje al comprador ("Te enviamos la Gift Card por
WhatsApp") ya no depende de que la imagen aparezca en pantalla. Queda como
limitación conocida, no se resuelve en esta fase (requeriría seguir haciendo
polling unas rondas más incluso tras el primer estado "confirmado", o mover
la imagen a la respuesta síncrona — ninguna de las dos sin trade-offs
claros).

## Verificado en vivo (Wompi sandbox real + Supabase Storage real + WhatsApp real)

Flujo completo probado de punta a punta, no solo con los 139 tests
automatizados:

1. `/regalar` (5 pasos) → Gift Card creada → checkout real de Wompi sandbox
   (tarjeta de prueba, pago aprobado) → webhook confirma el pago.
2. Bucket `gift-cards` creado automáticamente en el primer upload (tras el
   fix de la trampa `NoSuchBucket` arriba).
3. Imagen renderizada con Puppeteer y subida — visualmente correcta (diseño
   floral: nombre del destinatario, comprador, servicio, código).
4. Gift Card enviada como documento por WhatsApp al comprador (Meta Cloud
   API, `sendDocument`) — entregada al número autorizado en la app de
   prueba de Meta.
5. `/validar`: consulta del código → "Válida, se puede canjear" con todos
   los datos → canje con `STAFF_PIN` → "Gift Card canjeada", `status:
   REDEEMED` confirmado en base de datos.
6. `/gracias?type=gift` muestra la confirmación y (tras el fix de CSP) la
   imagen.

## Qué falta (fuera de Fase 8)

- La notificación al negocio (`BUSINESS_NEW_GIFT_CARD`) depende de que
  `business.whatsappNumber` también esté en la lista de números autorizados
  de la app de prueba de Meta — no se verificó en vivo (solo el envío al
  comprador). Mismo mecanismo, no debería requerir cambios de código.
- El timing entre `PAID` y la imagen lista (ver arriba).
- Reintento manual de `finalizeGiftCardAfterPayment` si Puppeteer/Storage/
  WhatsApp fallan tras el pago: hoy solo queda logueado
  (`gift_card_image_generation_failed`, `whatsapp_gift_card_send_failed`),
  sin endpoint ni job para reprocesar. El "claim antes de enviar" en
  `notification_log` (mismo patrón de Fase 6) evita reenvíos duplicados,
  pero también evita que un reintento automático recupere un envío fallido.
