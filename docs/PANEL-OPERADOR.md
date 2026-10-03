# Panel de operador y evolución multi-cliente

Plan de desarrollo y bitácora de decisiones. Nació antes de escribir código, con
el modelo conceptual, los flujos y las fases; hoy F0–F3 y F5 están en `main`, y
F4, F6 y F7 (portal de cliente) van a medias. El estado por fase, en §10.

Contexto: hoy el sistema atiende **un** negocio. El objetivo es que el operador
(dueño de la automatización) pueda **vender el servicio a varios spas/salones**,
darlos de alta él mismo, configurarles marca y pagos, cobrarles la mensualidad y
**suspenderlos si no pagan** — todo desde un panel interno. No es un SaaS
self-service: el operador crea los clientes y maneja la cartera a mano.

---

## 1. Alcance

### Sí entra

- Panel interno de un solo usuario (el operador) para dar de alta, configurar,
  activar, suspender y reactivar negocios.
- Gestión de marca por negocio: nombre, logo, colores, config del agente,
  perfil de WhatsApp.
- WhatsApp multi-cliente bajo **una sola app de Meta** vía **Embedded Signup**
  (el cliente solo hace login con Facebook).
- Wompi **por negocio**: cada spa recibe su plata directo en su cuenta.
- Dos modos de cobro: pago total por link, o **abono** de un % del servicio para
  separar el cupo (el resto se paga en el local).
- Planes con fecha de vencimiento, historial de **facturas y recibos internos**
  (PDF), y dashboard de cartera / vencimientos.
- Métricas de ingresos del operador.

### No entra (v1)

- Registro self-service de clientes (signup público).
- Cobro automático de la mensualidad (pasarela para que el cliente te pague).
- Facturación electrónica DIAN — se emiten **recibos internos + PDF**; la
  facturación formal queda como tema futuro.
- Portal para que el cliente edite su propia configuración.

### Diferido, pero contemplado en la arquitectura desde F0

- **Portal de cliente / CRM**: que cada spa entre a ver sus conversaciones del
  bot, citas, clientas y métricas. Es el objetivo de producto a mediano plazo
  (fase **F7**). No es una superficie de v1, pero el stack, la auth y el modelo
  de tenant se diseñan multi-usuario desde el principio para no rehacerlos.
- **Multi-usuario / roles**: la auth (Better Auth, §8) trae organizaciones y
  RBAC desde el inicio. En v1 solo existe el rol `operator` (tú); los roles de
  cliente (`client_owner`, `client_staff`) se activan en F7.

---

## 2. Decisiones tomadas (cerradas)

| # | Decisión | Consecuencia principal |
|---|---|---|
| D1 | **Una sola app / cuenta de WhatsApp** para todos los clientes; onboarding por Embedded Signup (login con Facebook, sin cuentas de desarrollador) | Hay que **verificar el negocio en Meta** y pasar **App Review**. Un solo webhook para todas las WABAs. |
| D2 | Cada cliente **posee su WABA** y **pone su propia tarjeta** en ella para pagar las conversaciones a Meta | El operador no frontea costos de mensajería. Sin *credit line sharing*. |
| D3 | **Wompi por negocio**; la plata del spa va directo a su cuenta | Las 4 llaves `PAYMENT_*` pasan de variable de entorno a **credenciales cifradas por negocio**. |
| D4 | Modo de cobro por negocio: `total` (link por el 100%) o `abono` (link por un % configurable; el resto presencial) | Ambos modos usan Wompi. Cambia la lógica de `createAgentAppointment` y del hold. |
| D5 | Historial de **facturas y recibos internos + PDF**. Sin DIAN por ahora. | Entidades nuevas `OperatorInvoice` / `OperatorPayment` + generación de PDF. |
| D6 | El operador crea las cuentas de Wompi y registra las llaves él mismo | El panel solo **almacena y administra** llaves; no las provisiona. |
| D7 | El operador es **persona natural sin registro mercantil** ("por ahora") | **Bloquea** la verificación de negocio en Meta → bloquea Embedded Signup y App Review. Ver §7.1 y §11. El documento que emite es **cuenta de cobro**, no factura, y sin IVA. |
| D8 | Planes: **prueba 7 días** (gratis), **mensual $50.000 COP**, **gracia 3 días** tras el vencimiento | Config por defecto de `SubscriptionPlan`. Ver §6.5. |
| D9 | **Panel propio, no admin genérico.** Se descarta Directus/Retool: el objetivo es un producto (CRM + portal de cliente), no un CRUD interno. Stack: **monorepo (Turborepo + pnpm) · Next.js 15 App Router · Tailwind + shadcn/ui · Better Auth · Vercel**. Ver §8. | El repo actual se reorganiza como monorepo (`apps/backend`, `apps/panel`, `packages/*`) en F0. El backend Fastify sigue siendo el dueño único del Postgres. |
| D10 | **El panel (en Vercel) no toca la DB directo**; toda la data pasa por la API `/admin/*` del backend Fastify. Tipos y validación compartidos vía `packages/shared` (Zod). | El backend queda como única superficie con acceso a Postgres (que sigue privado en Railway). Hay que construir `/admin/*` con paginación/filtros server-side. |
| D11 | **Auth: Better Auth montado en el backend Fastify** (`/api/auth/*`), sobre el mismo Postgres, con plugin `organization` (tenant = `businessId`), `bearer` y `twoFactor`. Rol `operator` en v1; roles de cliente en F7. El panel es cliente puro (patrón BFF, D12). | Postgres sigue 100% en el backend (respeta D10). El backend valida la sesión en cada request a `/admin/*` (`requireOperatorSession`). Sin costo por MAU. |
| D12 | **El panel usa BFF**: el navegador solo habla con el panel; sus route handlers de Next reenvían a `/api/auth/*` y `/admin/*` con la sesión adjunta server-side (cookie o `Authorization: Bearer` vía plugin `bearer`). | No hace falta dominio compartido ni cookies cross-site para arrancar. `PANEL_URL` va en CORS + `trustedOrigins` de Better Auth. |

---

## 3. El cambio de fondo: de "una variable de entorno" a "por negocio"

El modelo `Business` ya es multi-tenant (slug, timezone, currency, settings…),
pero las integraciones **no lo son**. Eso es el grueso del trabajo:

| Integración | Hoy | Debe pasar a |
|---|---|---|
| WhatsApp | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (env únicas) | ✅ **F4 (envío)**: `WhatsAppAccount` por negocio (`wabaId`, `phoneNumberId`, token cifrado) resuelto por `resolveWhatsAppProviderForBusiness`, con fallback a las env. ✅ **Embedded Signup construido** (§7.4), apagado hasta el App Review; el alta manual de §7.3 queda como puente y como salida de emergencia |
| Wompi | `PAYMENT_API_KEY`, `PAYMENT_PUBLIC_KEY`, `PAYMENT_INTEGRITY_SECRET`, `PAYMENT_WEBHOOK_SECRET` (env únicas) | ✅ **F2**: tabla `PaymentCredentials` por negocio, cifrada (con fallback a las env) |
| Google Sheets | `GOOGLE_*` + `GOOGLE_SHEET_ID` (env únicas) | config por negocio (opcional, fase tardía) |
| Agente n8n | `SPA_AGENT_TOKEN` compartido, negocio se resuelve por `businessId` | ✅ ya sirve, no cambia |
| Resolución de tenant en el webhook de WhatsApp | por `display_phone_number` | ✅ **F1**: por `phone_number_id` (`whatsAppAccountRepository`) con fallback al número |

> **Nota de arquitectura**: este plan es una **desviación deliberada** del
> "backend desatendido, sin dashboard" de la sección 42 del prompt maestro.
> ✅ `ARCHITECTURE.md` ya está actualizado: tiene una sección "Superficies de
> interfaz" que describe las tres (páginas públicas, panel de operador, portal
> de cliente) y el monorepo de §8.3.

---

## 4. Modelo de datos (conceptual)

### Cambios a entidades existentes

**`Business`**
- `status`: `trial` → `active` → `past_due` → `suspended` → `cancelled`
  (ver máquina de estados en §5).
- `modoCobro`: `total` | `abono`.
- `abonoPorcentaje`: entero 1–100 (solo aplica si `modoCobro = abono`; puede
  vivir global en el negocio o por servicio si más adelante se necesita).
- Branding formalizado: `logoUrl`, `colorPrimario`, `colorSecundario` (hoy
  medio disperso entre la columna `logoUrl` y `settings`).

**`Appointment` / `Payment`**
- Soportar pago **parcial**: `montoAbonado`, `saldoPendiente`, y un
  `paymentStatus` que distinga `DEPOSIT_PAID` de `PAID`.

### Entidades nuevas

| Entidad | Para qué | Campos clave |
|---|---|---|
| `WhatsAppAccount` | 1+ por negocio | `businessId`, `wabaId`, `phoneNumberId`, `displayName`, `accessToken` (cifrado), `estadoSuscripcion`, `calidad`, `limiteMensajeria` |
| `PaymentCredentials` | 1 por negocio | `businessId`, llaves Wompi (cifradas), `entorno` (`test`/`prod`) |
| `SubscriptionPlan` | 1 por negocio | `businessId`, `nombrePlan`, `precio`, `moneda`, `ciclo` (`mensual`/`anual`), `vigenteHasta`, `diasGracia` |
| `OperatorInvoice` | cuenta de cobro al cliente (ver §6.5) | `numero`, `businessId`, `fechaEmision`, `fechaVencimiento`, `periodoDesde`, `periodoHasta`, `items[]`, `subtotal`, `impuestos` (0 por ahora), `total`, `estado` (`borrador`/`enviada`/`pagada`/`vencida`/`anulada`), `pdfUrl` |
| `OperatorPayment` | recibo de pago recibido | `businessId`, `invoiceIds[]`, `fecha`, `monto`, `metodo`, `referencia`, `pdfUrl` |
| `ClientContact` | a quién le vendiste | `businessId`, `nombre`, `telefono`, `email`, `fechaVenta` |
| `AuditLog` | trazabilidad de acciones sensibles | `actor`, `accion`, `businessId`, `antes`, `despues`, `timestamp` |
| Tablas de **Better Auth** | auth del panel (§8) | `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation` — las genera Better Auth; `organization` mapea 1:1 con `Business` (por `businessId`) |

---

## 5. Máquina de estados del negocio

```
                  provisioning completo
   trial ───────────────────────────────▶ active
     │                                     │  │
     │ (nunca activó / abandonó)            │  │ factura vencida + gracia agotada
     ▼                                      │  ▼
 cancelled ◀───────────────────────────┐   │ past_due
     ▲                                 │   │  │
     │ operador cancela definitivamente│   │  │ operador suspende  /  mora prolongada
     │                                 │   │  ▼
     └─────────────────────────────────┴───┴ suspended
                        reactivar (pago al día) ──▶ active
```

### Qué hace cada estado

| Estado | Bot de WhatsApp | Agente n8n | Reservas web / API | Gift cards |
|---|---|---|---|---|
| `trial` / `active` | responde normal | según `agentEnabled` | ✅ | ✅ |
| `past_due` | responde normal (aún no se corta) | ✅ | ✅ | ✅ |
| `suspended` | **suspensión suave**: responde un único mensaje "servicio temporalmente inactivo, contacta a [operador/encargada]" y no procesa nada más | off | 403 con página de aviso | bloqueado |
| `cancelled` | silencio / mensaje de baja | off | 404 | bloqueado |

> **Por qué suspensión suave y no dura**: si el bot deja de responder en seco, la
> clienta del spa se queja con el spa y el spa contigo. Un mensaje claro de
> "servicio inactivo" hace que el **cliente moroso** te escriba, que es el
> objetivo. Y debe ser **reversible al instante** (cambio de `status`, sin
> desplegar).

### Enforcement

El `status` se consulta en **cada puerta de entrada**. **Hecho en F1**
(`apps/backend/src/services/business-guard.ts`):

- `isBusinessOperational` / `assertBusinessOperational`. Operativos: `TRIAL`,
  `ACTIVE`, `PAST_DUE`. Cortan: `SUSPENDED` (→ `BusinessSuspendedError` 403),
  `CANCELLED` y el flag legacy `active=false` (→ 404, no revela que existe).
- Superficies HTTP que llaman al guard: `getBusinessBySlug` (`/api/business/:slug`),
  `getAvailability`, `createAppointment`, `listServices`, `createGiftCard`, y
  `requireBusiness` del agente (cubre `/internal/agent/*`). El formulario web ya
  muestra el mensaje del 403/404 en su alerta de error.
- **Gift cards ya pagadas**: el canje y la validación **no** se bloquean — no se
  castiga a la clienta por la mora del negocio; solo se bloquea *comprar* una
  nueva.
- **WhatsApp** no lanza 4xx: `SUSPENDED` → un único mensaje "servicio
  temporalmente inactivo"; `CANCELLED`/`active=false` → silencio total.
- `business.active` se mantiene (lo respeta el guard) hasta que un cambio
  posterior lo elimine en favor de `status`.
- Webhook de pago (`/api/webhooks/payment`): **sin** guard a propósito — un
  negocio suspendido debe seguir confirmando pagos de reservas en vuelo.

---

## 6. Flujos clave

### 6.1 Onboarding de un cliente nuevo

El panel muestra un **checklist con estado** por negocio; el negocio queda en
`trial` hasta completarlo todo, luego pasa a `active`.

| Paso | Lo hace | Dónde |
|---|---|---|
| 1. Datos básicos (nombre, slug, timezone, moneda) + contacto del dueño | operador | panel |
| 2. Marca: logo, colores, persona del agente (`settings.agent`) | operador | panel |
| 3. Servicios + horarios de atención | operador | panel |
| 4. **WhatsApp**: el cliente hace Embedded Signup (login FB → elige/crea WABA y número → autoriza). El backend intercambia el código por token, registra el número y suscribe la app a la WABA (✅ §7.4) | cliente + backend (automático) | enlace de auto-conexión, o botón del panel → Meta |
| 5. Aprobar nombre visible de WhatsApp y foto de perfil | operador (envía a revisión de Meta) | panel → API de Meta |
| 6. **Wompi**: el operador crea la cuenta en Wompi, pega las 4 llaves, el sistema configura el webhook de Wompi apuntando al backend | operador | panel + dashboard de Wompi |
| 7. Google Sheet (opcional) | operador | panel |
| 8. Plan: nombre, precio, ciclo, `vigenteHasta` | operador | panel |
| 9. Activar → `status: active` | operador | panel |

Lo que **no se puede automatizar** y el panel solo *rastrea*: verificación de
número por OTP, aprobación de nombre visible por Meta, creación de la cuenta de
Wompi.

> ✅ **Implementado en F3d.** Cada negocio tiene tres pestañas en el panel:
> **Datos** (F3c), **Marca** y **Onboarding**.
>
> **Marca** (`GET`/`PATCH /admin/businesses/:id/branding`,
> `admin-branding.service.ts`): `logoUrl` (URL pública — todavía **no** hay
> carga de archivos), `colorPrimary`/`colorSecondary` (hex validado, con
> selector de color en el panel) y la **persona del agente** —`agentEnabled` +
> `agent.*`, las mismas claves que `AgentForwarder` le manda a n8n. Los dos
> orígenes (columnas de `Business` y el JSON `settings`) se escriben en una sola
> operación; `""` en un campo lo borra en vez de guardar cadena vacía, y el resto
> de `settings` nunca se pisa. Audita `business.branding.update`.
>
> **Checklist** (`GET`/`PATCH /admin/businesses/:id/onboarding`,
> `admin-onboarding.service.ts`): los 9 pasos de la tabla de arriba. Se
> **derivan de la data** (servicios y horarios activos, `WhatsAppAccount`,
> `PaymentCredentials`, `SubscriptionPlan`, marca completa, contacto del dueño)
> en vez de guardarse como banderas, para que no se desincronicen si se borra una
> fila. Excepción: los pasos `manual` que el panel no puede verificar —hoy solo
> la aprobación del perfil de WhatsApp por Meta— viven en
> `settings.onboarding`. El Google Sheet es el único paso `required: false`: no
> bloquea. La marca exige la persona del agente **solo** si `agentEnabled`.
>
> **Catálogo** (pestaña Catálogo, `admin-catalog.service.ts`, pasos 3–4):
> `/admin/businesses/:id/services` (CRUD; un servicio con citas no se borra
> —FK `Restrict`—, se pausa con `active: false`) y `/admin/businesses/:id/hours`
> (`PUT` de la semana completa, upsert por `(businessId, dayOfWeek)`; un día
> cerrado conserva su fila con `active: false`). Cambiar precio u horario no
> toca citas ya agendadas (cada `Appointment` guarda su precio y horas). Audita
> `business.service.*` y `business.hours.update`.
>
> **Activación** (`POST /admin/businesses/:id/activate`): `TRIAL` → `ACTIVE`
> (paso 9). El backend **revalida el checklist completo** —el botón deshabilitado
> del panel es comodidad, no seguridad— y rechaza desde cualquier estado que no
> sea `TRIAL`: reactivar un `SUSPENDED` va atado al pago (§6.4, F5). Audita
> `business.activate`.
>
> Los pasos de servicios, horarios, WhatsApp, Wompi y plan **se muestran** pero
> todavía no tienen editor en el panel: se cargan por la API/DB del backend. Sus
> pantallas llegan con F4/F5.

### 6.2 Cobro: `total` vs `abono`

> ✅ **Implementado en F2.** `business.chargeMode` (`TOTAL` | `DEPOSIT`) +
> `depositPercentage` (1–99; 100 se comporta como TOTAL). El split se calcula y
> persiste (`appointment.depositAmount` / `pendingBalance`) **al crear el link de
> pago**. El pago confirmado deja `paymentStatus = DEPOSIT_PAID`. Los mensajes
> (bot de WhatsApp, herramienta del agente, confirmación, `/gracias`, formulario
> web) muestran el abono y el saldo presencial. Las **gift cards siempre cobran
> el 100%** — el abono es solo para reservas.

```
Reserva creada (createAppointment: hold PENDING por PENDING_EXPIRATION_MINUTES)
        │
        ├─ modoCobro = total   → link Wompi por el 100% del servicio
        │                         pago confirmado → CONFIRMED / PAID
        │
        └─ modoCobro = abono   → link Wompi por (precio × abonoPorcentaje)
                                  pago confirmado → CONFIRMED / DEPOSIT_PAID
                                  guarda montoAbonado y saldoPendiente
                                  el mensaje al cliente dice el saldo a pagar en el local
```

- `createAgentAppointment` (hoy siempre llama a `createPayment` por el total)
  pasa a leer `business.modoCobro` y calcular el monto del link.
- El **hold** sigue igual: si no llega el pago (total o abono) en
  `PENDING_EXPIRATION_MINUTES`, la cita expira sola.
- Un negocio que **no quiera ningún pago online** no encaja en este modelo;
  si aparece el caso, se agrega un tercer modo `sin_pago` (confirma la reserva
  directo, sin link). No se implementa hasta que se necesite.

### 6.3 Webhook de Wompi multi-comercio

> ✅ **Implementado en F2** (`payment.service.processPaymentWebhook`).

Un solo endpoint. El evento trae un `reference`; el modelo `Payment` ya guarda
`businessId`. Flujo:

1. `extractWebhookReference` lee `reference` del payload **sin verificar**.
2. Buscar el `Payment` → si no existe, responde 200 y no hace nada. Si existe,
   obtener `businessId` → `resolveProviderForBusiness` carga sus
   `PaymentCredentials` (descifradas) o cae a las env `PAYMENT_*` globales.
3. Validar la firma del evento con el secreto de eventos **de ese negocio**.
   Referencia conocida + firma inválida → 401; referencia desconocida → 200.
4. Procesar (transacción con lock por `reference`, idempotente, sin cambios).

> El `reference` no es secreto, pero un atacante que lo adivine igual no puede
> falsificar la firma del comercio correcto. Aceptable.

**Cómo cargar las credenciales de un negocio antes del panel (F3):**
`pnpm --filter @spa/backend script:demo-payment-credentials [slug]` cifra las env
`PAYMENT_*` actuales y las guarda como `PaymentCredentials` de ese negocio
(por defecto `demo-spa`). Requiere `SECRETS_ENCRYPTION_KEY` en el entorno.
Borrar la fila revierte al fallback por env sin desplegar.

### 6.4 Facturación recurrente + recibos

- Un job programado (n8n o cron in-process) corre a diario:
  - Crea la siguiente `OperatorInvoice` en `borrador` **N días antes** de
    `vigenteHasta`.
  - Marca `vencida` las facturas impagas pasado `fechaVencimiento`.
  - Mueve el negocio a `past_due`, y a `suspended` cuando se agotan los
    `diasGracia`.
- El operador registra el pago recibido → crea `OperatorPayment` → marca la(s)
  factura(s) `pagada(s)` → si el negocio estaba `past_due`/`suspended`, lo
  reactiva y extiende `vigenteHasta`.
- Cuenta de cobro y recibo se generan como **PDF** (mismo enfoque que las Gift
  Cards: template HTML/CSS → Puppeteer → archivo en Storage).

### 6.5 Planes y cuentas de cobro

**Planes** (valores por defecto de `SubscriptionPlan`, editables por negocio en
el panel):

| Plan | Precio | Ciclo | Gracia | Notas |
|---|---|---|---|---|
| `prueba` | $0 | 7 días | — | negocio en `trial`; al día 7 sin conversión → `past_due`, luego `suspended` |
| `mensual` | $50.000 COP | 30 días | 3 días | vencido + 3 días sin pago → `suspended` |

- `vigenteHasta` se recalcula al registrar cada `OperatorPayment`
  (`vigenteHasta += 30 días`).
- El job diario (§6.4) genera la cuenta de cobro ~5 días antes de
  `vigenteHasta`, marca `vencida` en `fechaVencimiento`, mueve a `past_due`, y a
  `suspended` cuando pasan los 3 días de gracia.

**Cuenta de cobro** (no "factura": el operador es persona natural sin registro,
sin IVA — D7). Template en `docs/assets/factura-referencia.webp`. Estructura a
replicar en HTML/CSS:

```
┌─────────────────────────────────────────────────────────┐
│  CUENTA DE COBRO            [nombre/marca del operador]  │  ← acento naranja
│  #CC-2026-001                [datos de contacto]         │
│  02 septiembre 2026                                      │
├─────────────────────────────────────────────────────────┤
│  Cobrar a:  [Nombre del spa]                             │
│             [NIT/CC, dirección, email del cliente]       │
├─────────────────────────────────────────────────────────┤
│  Concepto              Período            Valor          │
│  Plan mensual          sep 2 – oct 2     $50.000         │
│                         ───────────────────────          │
│                         Subtotal          $50.000        │
│                         Total a pagar     $50.000        │
├─────────────────────────────────────────────────────────┤
│  Forma de pago:  Transferencia / Nequi / Daviplata       │
│  [datos de la cuenta del operador]                       │
│                                                          │
│  Gracias. Dudas: [contacto del operador]                 │
└─────────────────────────────────────────────────────────┘
         [barra naranja: dirección · teléfono]
```

Diferencias con la plantilla de referencia: título **"CUENTA DE COBRO"** en vez
de "INVOICE"; columnas **Concepto / Período / Valor** (no Rate/Hours); **sin
línea de impuestos**; "Forma de pago" con datos de transferencia colombianos.
El **recibo** usa el mismo template con el sello "PAGADO" y la fecha/método del
`OperatorPayment`.

---

## 7. WhatsApp: Embedded Signup

### 7.1 Habilitación con Meta (empieza YA — tiene semanas de espera)

> ⚠️ **Requiere que el operador se formalice primero.** La verificación de
> negocio de Meta pide documentos de un negocio **registrado** (matrícula
> mercantil de Cámara de Comercio + RUT, o una SAS). Como persona natural sin
> registro (D7) **no se puede completar**, y sin ella no hay Embedded Signup ni
> App Review con Advanced Access. Ver §13 para el camino de formalización y el
> puente de §7.3 mientras tanto.

1. **Verificación del negocio** del Meta Business del operador (documentos
   legales: matrícula mercantil, RUT). Días a semanas.
2. App de Meta con los productos **WhatsApp** y **Facebook Login for Business**.
3. **App Review** pidiendo *Advanced Access* para:
   `whatsapp_business_management`, `whatsapp_business_messaging`,
   `business_management`. Requiere caso de uso + screencast. 1–4 semanas con
   idas y vueltas.
4. Configurar el flujo de Embedded Signup (Facebook Login for Business con la
   config de WhatsApp).

Mientras Meta aprueba, todo lo demás del plan (modelo de datos, Wompi
por-tenant, panel, facturación) avanza en paralelo.

### 7.2 Arquitectura del webhook multi-WABA

```
Meta (todas las WABAs de clientes)
   │  1 solo webhook (el de la app del operador)
   ▼
POST /api/webhooks/whatsapp
   │  resuelve negocio por  value.metadata.phone_number_id  →  WhatsAppAccount
   ▼
handleIncomingWhatsAppMessage(business, mensaje)
   │  check business.status  (suspensión suave si aplica)
   ▼
bot de menús  /  forwardToAgent (n8n)
```

- La firma `X-Hub-Signature-256` se valida con el **App Secret de la app**
  (uno solo, no por cliente) → `WHATSAPP_APP_SECRET` sigue siendo env única.
- El envío de mensajes (`MetaWhatsAppProvider`) toma el `accessToken` y
  `phoneNumberId` **del negocio**, no de env.
- Costos: las conversaciones de servicio iniciadas por la clienta son en su
  mayoría gratuitas hasta cierto volumen mensual; lo facturable lo paga el
  cliente con la tarjeta de su WABA (D2). Revisar el pricing vigente de Meta al
  implementar.

### 7.3 Interino sin verificación (el puente, ✅ construido)

Mientras Meta no apruebe, el operador añade a mano el número de cada cliente
**bajo su propia WABA**. Está implementado en el panel (pestaña *Integraciones*
de cada negocio):

- **Conectar**: WABA ID, `phone_number_id`, número y nombre visibles, y el token
  —que se guarda cifrado y solo vuelve como máscara—. La llave natural es el
  `phone_number_id`: reconectar el mismo número rota su token, y si pertenece a
  otro negocio el alta se rechaza en vez de robarle las conversaciones.
- **Verificar**: consulta la Graph API con el token guardado y trae de vuelta la
  calidad del número y su tier de mensajería, que se persisten.
- **Desconectar**: el negocio vuelve a las credenciales globales del operador.

`connectWhatsAppAccount` era el **punto único de alta**, y sigue siéndolo en lo
que importa: el Embedded Signup (§7.4) escribe la misma fila por el mismo
repositorio, solo que con lo que devuelve el token exchange en vez de con lo que
escribió el operador. Nada del envío ni de la resolución de tenant cambia.

Sigue siendo un puente, no el destino: el operador posee la WABA, el cliente no
"hace login" en nada, y los topes de un negocio no verificado (típicamente 2
números / 250 destinatarios por día) mandan.

### 7.4 Embedded Signup (✅ construido, apagado hasta el App Review)

El destino de §7.3. El cliente hace **un** login con Facebook y el backend deja
el número listo para operar sin que nadie copie identificadores a mano.

**Está implementado y probado, pero llega apagado**: sin `META_APP_ID` y
`META_EMBEDDED_SIGNUP_CONFIG_ID` el panel oculta el botón y solo ofrece el alta
manual, en vez de mostrar un botón que va a fallar. El día que Meta apruebe la
app (§7.1) se llenan las dos variables y el flujo queda vivo sin desplegar nada
nuevo.

#### Las dos mitades

La mitad del **browser** la maneja el SDK de Facebook y devuelve el resultado
por dos canales distintos, que hay que juntar: `postMessage`
(`WA_EMBEDDED_SIGNUP`) trae `waba_id` y `phone_number_id`, y el callback de
`FB.login` trae el `code`. Ninguno de los dos trae todo.

La mitad de **servidor** (`integrations/whatsapp/embedded-signup.ts`) es la que
convierte eso en un número que puede mandar mensajes, en este orden y no otro:

| # | Llamada | Por qué ahí |
|---|---|---|
| 1 | `POST /oauth/access_token` (canje del `code`) | El `code` es de un solo uso y de vida corta. Meta devuelve un *business integration system user access token*: **no expira** y es lo único que se guarda (cifrado, §9). |
| 2 | `POST /{waba_id}/subscribed_apps` | Sin esto el webhook **nunca** recibe nada. Es el gotcha que `docs/WHATSAPP.md` documenta a mano; aquí es obligatorio y automático, y si falla se aborta el alta en vez de dejar una cuenta muda. |
| 3 | `POST /{phone_number_id}/register` | Habilita el número en Cloud API con un PIN de dos pasos generado al vuelo y guardado cifrado (hace falta para re-registrar si Meta lo desactiva). Un número ya registrado (error 133006) se trata como éxito idempotente. |
| 4 | `GET /{phone_number_id}` | Nombre visible, calidad y tier, para el panel. |

La fila de `whatsapp_accounts` se escribe **al final**: esa fila significa "este
negocio puede mandar y recibir por acá", y hasta el paso 3 eso no es cierto. Si
algo falla, el negocio se queda como estaba —con el fallback a las credenciales
globales del operador— en vez de quedar a medio conectar.

El resultado es idéntico al del alta manual salvo por `onboarding_source`, así
que `resolveWhatsAppProviderForBusiness`, el webhook multi-WABA y el checklist
de onboarding siguen funcionando sin cambios.

#### Dos puertas al mismo flujo

El signup lo tiene que completar el dueño de la WABA con **su** Facebook y **su**
tarjeta (D2): el operador no puede hacerlo por él. De ahí las dos entradas:

- **Enlace de auto-conexión** (lo normal). El operador genera una URL de un solo
  uso desde el panel y se la manda al cliente por WhatsApp; el cliente la abre
  en su teléfono (`/conectar/:token`, una página vanilla más del backend) y hace
  el login. El token se guarda **hasheado** (SHA-256) —no cifrado: nunca hay que
  volver a leerlo, solo compararlo— y la URL se muestra una única vez, al
  crearla. Vence (`WHATSAPP_SIGNUP_LINK_TTL_HOURS`, 72h por defecto), es de un
  solo uso, y generar uno nuevo revoca los pendientes: en un hilo de WhatsApp
  con varios enlaces el cliente casi seguro abre el que no toca.
- **Botón en el panel**, para cuando el operador está con el cliente o
  compartiendo pantalla.

Si Meta falla a mitad de camino, el enlace **sigue PENDING** a propósito: casi
todos esos errores (número con otro PIN de dos pasos, permisos que faltan) se
arreglan y se reintentan con el mismo enlace. El motivo se guarda en
`last_error` y el panel lo muestra, para no tener que pedirle una captura al
cliente.

#### Superficie pública y su blindaje

`GET`/`POST /api/whatsapp/signup/:token` son las **únicas** rutas del flujo sin
sesión: las abre alguien que no tiene —ni va a tener— usuario en el panel. Lo
que las protege:

- El token es la autorización: 32 bytes aleatorios en base64url. Su poder es
  deliberadamente mínimo —conectar **un** número a **un** negocio— porque viaja
  en la URL y por tanto queda en los logs del proxy.
- Un token inexistente y uno vencido responden **igual** (404), para no volver
  el endpoint un oráculo de tokens válidos.
- La portada solo revela el nombre del negocio; nada del operador ni de otros
  clientes.
- Límite de tasa propio (20/min) más estricto que el global.
- `/conectar` lleva una **CSP propia**, ampliada solo con los orígenes de
  Facebook (el Embedded Signup *es* el SDK de Meta: no hay forma de hacerlo con
  un `fetch` nuestro). Las páginas de reserva y gift cards —donde hay datos de
  clientas y montos— siguen sin poder cargar scripts de terceros.
- Un `phone_number_id` que ya es de otro negocio se rechaza antes de hablar con
  Meta: es la llave con la que el webhook resuelve el tenant, y robárselo a otro
  negocio le cortaría las conversaciones en vivo.

#### Variables de entorno

| Variable | Qué es |
|---|---|
| `META_APP_ID` | App ID del operador. No es secreto (viaja al browser), pero cambia por despliegue, así que lo sirve el backend en vez de vivir en un `NEXT_PUBLIC_*`. |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | El *configuration ID* del flujo de Facebook Login for Business. |
| `WHATSAPP_APP_SECRET` | El `client_secret` del canje. Es el **mismo** App Secret que firma los webhooks: no hay una segunda llave. |
| `META_GRAPH_VERSION` | Versión de la Graph API del signup y del SDK (`v21.0`). |
| `WHATSAPP_SIGNUP_LINK_TTL_HOURS` | Vida del enlace de auto-conexión (72h; máx 720). |

---

## 8. El panel: arquitectura y stack

### 8.1 Por qué panel propio y no un admin genérico

La v0 de este documento proponía **comprar** un admin genérico (Directus / Retool)
porque era 1 usuario, <20 clientes y "sin valor diferencial en el CRUD". **Ese
supuesto ya no aplica.** El objetivo real es un producto: CRM, un portal donde
cada spa entra a ver las conversaciones de su bot, métricas de uso, y evolución a
multi-usuario con roles. Un admin genérico no llega ahí, y dejaría dos frentes
(el genérico interno + el portal custom) con dos modelos de auth y dos deploys.

**Decisión (D9): se descarta Directus.** Se construye un panel propio desde el
inicio, con un stack pensado para crecer al CRM. El trabajo de "CRUD + tablas +
filtros" que Directus ahorraba hoy se cubre con librerías (shadcn/ui + TanStack
Table) en horas, no semanas, y sin lock-in.

### 8.2 Stack (D9–D11)

| Capa | Elección | Por qué |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | comparte `schema.prisma`, tipos y Zod entre backend y panel; un solo pipeline |
| Frontend | **Next.js 15 (App Router) + React 19 + TypeScript** | RSC + streaming, ecosistema grande, primera clase en Vercel |
| UI | **Tailwind + shadcn/ui** (Radix primitives) | componentes que son código tuyo (copy-in), accesibles, temeables por cliente; **nada de HTML/CSS vanilla ni lock-in de librería** |
| Tablas / grids | **TanStack Table** | paginación, orden y filtros server-side contra `/admin/*` |
| Formularios | **React Hook Form + Zod** | los schemas Zod viven en `packages/shared` y los usa también el backend |
| Charts | **Recharts** (visx si algo se complica) | dashboards de cartera, ingresos, uso por cliente |
| Datos servidor | **TanStack Query** + Server Actions donde encaje | |
| Auth | **Better Auth** self-host sobre el Postgres · plugin `organization` (tenant = `businessId`) · RBAC · 2FA | multi-tenant desde F0, sin costo por MAU, TS nativo |
| Acceso a datos | **solo vía API `/admin/*` del backend** — el panel nunca abre Postgres (D10) | el panel corre en Vercel, fuera de la red privada de Railway; el backend sigue siendo dueño único de la DB |
| Tipos compartidos | `packages/shared` (Zod + DTOs) · `packages/db` re-exporta tipos de Prisma | type-safety end-to-end sin exponer la conexión |
| Realtime (conversaciones en vivo) | **SSE** desde el backend (`GET /admin/streams/conversations`) o polling corto; evaluar Ably/Pusher si crece | Vercel no sostiene WebSockets largos hacia Railway con comodidad |
| Deploy panel | **Vercel** (root dir `apps/panel`), preview deploy por PR | |
| Deploy backend | Railway (sin cambios, salvo el nuevo build path del monorepo) | |

### 8.3 Estructura del monorepo

```
spa/
├── apps/
│   ├── backend/        # Fastify + integraciones + jobs  → @spa/backend
│   └── panel/          # Next.js — panel del operador + portal de cliente (F3)
├── packages/
│   ├── db/             # schema.prisma + migraciones + tipos Prisma → @spa/db
│   ├── shared/         # Zod schemas, DTOs, constantes compartidas (llega con F3)
│   └── ui/             # componentes shadcn compartidos (si el portal crece, F7)
├── pnpm-workspace.yaml
└── turbo.json
```

**Estado**: F0 está **completa y en `main`** (PR #1 + commits siguientes).

Monorepo:

- `pnpm workspaces + Turborepo`; gestor de paquetes fijado en `packageManager`.
- Todo el backend movido a `apps/backend/` (incluye `web/`, `tests/`, `.env`,
  `Dockerfile`). Los imports internos (relativos, con `.js`) no cambiaron.
- `prisma/` movido a `packages/db/prisma/`. Nuevo `@spa/db` = wrapper fino
  (`index.js`: `export * from "@prisma/client"`); el backend importa tipos y
  `PrismaClient` desde `@spa/db`, y mantiene su instancia configurada en
  `apps/backend/src/db/prisma.ts`. Solo cambiaron los ~19 imports de
  `@prisma/client` → `@spa/db`.
- Railway: `railway.json` con `build.dockerfilePath: apps/backend/Dockerfile`
  (contexto de build = raíz). Dockerfile reescrito para pnpm monorepo.
- **Deploy real en Railway verificado en verde** (deploy `1fbe9bb5`): docker
  build, `pnpm install --frozen-lockfile`, `prisma generate` + build, `prisma
  migrate deploy`, `/health` → `{"status":"ok","db":"ok"}`, rutas estáticas 200.

Modelo de datos (migración `20260903194848_panel_operador_data_model`):

- `Business`: `+ status` (enum `BusinessStatus`, default `TRIAL`; backfill de los
  negocios en vivo a `ACTIVE`), `+ chargeMode` (`TOTAL`/`DEPOSIT`),
  `+ depositPercentage` (CHECK 1–100), `+ colorPrimary`/`colorSecondary`. Se
  mantiene `active` hasta que F1 migre el guard.
- `Appointment`: `+ depositAmount`/`pendingBalance`; `PaymentStatus += DEPOSIT_PAID`.
- Entidades nuevas: `WhatsAppAccount`, `PaymentCredentials`, `SubscriptionPlan`,
  `OperatorInvoice`, `OperatorPayment` + `OperatorPaymentInvoice` (join N:N),
  `ClientContact`, `AuditLog`. Secretos en columnas `*_enc`.
- Tablas de **Better Auth** se difieren a F3 (las genera Better Auth).

Cifrado de secretos por-tenant (§9):

- `apps/backend/src/utils/crypto.ts`: `encryptSecret`/`decryptSecret`/
  `isEncryptedSecret`, AES-256-GCM autenticado. Formato `v1:<base64(iv|tag|ct)>`.
- Clave maestra `SECRETS_ENCRYPTION_KEY` (env de Railway, base64 de 32 bytes;
  `openssl rand -base64 32`). Opcional en el schema de env hasta que F2/F4
  guarden credenciales; `encryptSecret` lanza si se usa sin configurarla.
- Rotación de la clave maestra: pendiente (el prefijo `v1:` deja espacio).

`packages/shared` — ✅ **creado en F3a**. Zod schemas + DTOs (`adminMeSchema`,
`paginationQuerySchema`, `PaginatedResponse`, `paginate`). Compila a `dist/` con
`tsc` (el backend lo importa como JS en runtime; el Dockerfile lo compila antes
que el backend). `packages/ui` sigue diferido a F7.

**Better Auth (F3a):** `apps/backend/src/auth/better-auth.ts` — `prismaAdapter`,
`emailAndPassword` (sin verificación por correo en v1, 12+ chars), plugins
`bearer` + `twoFactor` + `organization`. Cookie de sesión `SameSite=None; Secure`
solo en prod (`lax`/no-secure en dev http). Sin `BETTER_AUTH_SECRET` el backend
arranca normal pero **no monta** `/api/auth/*` ni `/admin/*` (`isPanelAuthEnabled`).
Las 8 tablas (`user`, `session`, `account`, `verification`, `twoFactor`,
`organization`, `member`, `invitation`) se generan con `@better-auth/cli generate`
y se fusionan a `packages/db/prisma/schema.prisma` **sin** `@map` snake_case (son
contrato con la librería). ⚠️ El `@better-auth/cli` está congelado en 1.4.x y core
va en 1.7.2 — omitió `account.issuer` (obligatorio en 1.7); se agregó a mano +
migración `..._better_auth_account_issuer`. Al subir de versión, comparar contra
`getAuthTables()` de `better-auth/db`. Único añadido nuestro:
`Organization.businessId` (1:1 con `Business`). El usuario `operator` se crea con
`scripts/create-operator.ts` (no hay signup público; sana un `user` a medias).

**Panel (F3b):** `apps/panel` — Next 16 App Router + React 19 + Tailwind v4 +
componentes shadcn escritos a mano (`components/ui`). `app/login` (`signIn.email`
del cliente Better Auth apuntando a `/api/auth` del propio panel), `app/(app)`
= grupo protegido cuyo layout server-side llama `/admin/me` (vía `lib/backend.ts`,
reenvía cookies) y rebota a `/login` si no hay sesión. **BFF**:
`app/api/auth/[...all]/route.ts` proxea a `${BACKEND_URL}/api/auth/*` —
rechaza requests cross-origin al panel y reescribe el `Origin` al del backend
(Better Auth valida `Origin`==`baseURL`/trusted + Fetch Metadata, y rechaza un
`Origin` cross-site aunque esté en `trustedOrigins`). Deploy: **Vercel**, Root
Directory `apps/panel`, `vercel.json` (`turbo run build --filter=@spa/panel`).
Env del panel: `BACKEND_URL` (server-only), `NEXT_PUBLIC_PANEL_URL`.

**Marca y onboarding (F3d):** el detalle de un negocio pasa a
`app/(app)/businesses/[id]/layout.tsx` (cabecera + pestañas Datos / Marca /
Onboarding); cada pestaña carga su propia data. Los colores salieron del
formulario de Datos: ahora viven solo en Marca, para que un campo tenga un único
dueño. `components/ui/form-field.tsx` (`Field`, `SubmitButton`, `FormAlert`) se
extrajo de `business-form.tsx` y lo comparten los tres formularios. Backend:
`admin-branding.service.ts`, `admin-onboarding.service.ts` y
`business-settings.ts` — el único módulo que interpreta el JSON `Business.settings`
desde el panel (el runtime del bot lo sigue leyendo por su cuenta en
`AgentForwarder`).

### 8.4 Qué se construye vs qué solo se configura

| Parte | Enfoque |
|---|---|
| CRUD de negocios, branding, checklist de onboarding, dashboards de cartera e ingresos | **construir** en `apps/panel` (Next.js + shadcn + TanStack Table) contra `/admin/*` |
| Acciones con lógica (suspender en cascada, aprovisionar negocio, aprobar nombre WA) | **construir**: endpoints `/admin/*` en el backend Fastify |
| Callback de Embedded Signup (token exchange, registro de número, suscripción a WABA) | ✅ **construido** (§7.4): `integrations/whatsapp/embedded-signup.ts` + `whatsapp-signup.service.ts`, con enlace de auto-conexión para el cliente |
| Generación de PDF de cuentas de cobro / recibos | **construir**: reutilizar el pipeline Puppeteer de Gift Cards |
| Auth, organizaciones, invitaciones, roles, 2FA | **configurar** Better Auth (no construir) |
| Automatizaciones (recordatorio de vencimiento, auto-suspensión) | **configurar**: n8n (ya está) o cron in-process |
| Portal de cliente (ver conversaciones del bot, citas, métricas) | **construir** en `apps/panel`, mismas rutas con guard por rol (F7) |

### 8.5 El portal de cliente / CRM (F7) — nota de alcance

No es una superficie de v1, pero **la arquitectura lo asume desde F0**:

- Better Auth con `organization` desde el primer commit; `businessId` es el tenant.
- Roles: `operator` (tú, acceso total) en v1; `client_owner` y `client_staff`
  (acceso solo a su `businessId`) se activan en F7.
- Los endpoints `/admin/*` nacen con el filtro de tenant en el guard, aunque en
  v1 solo los use el operador. Así F7 es "encender un rol", no reescribir la API.
- La vista de conversaciones del bot reutiliza lo que ya persiste
  `whatsappConversation.repository` / `whatsapp-conversation.service`.

### 8.6 Portal de cliente — lo construido (F7a)

**Dos clases de usuario** en la misma tabla `user` de Better Auth, separadas por
`user.role` (`additionalFields`, `input: false`, default `client`; migración
`20261002120000_portal_user_roles`, que marca como `operator` a todos los
usuarios existentes):

| Rol | Superficie | Guard | Tenant |
|---|---|---|---|
| `operator` | `/admin/*` · panel `/dashboard`, `/businesses`… | `requireOperatorSession` (403 a cualquier otro rol) | todos |
| `client` | `/portal/*` · panel `/portal` | `requirePortalSession` | el de su `member` → `organization.businessId`; **nunca** de la URL |

Dentro del negocio, `member.role` usa los roles incorporados del plugin
`organization`: `owner` (dueño/a) y `member` (equipo). El equipo ve citas,
clientas y conversaciones; pagos, gift cards y métricas son solo del dueño
(`requirePortalOwner`). Un negocio `SUSPENDED` sigue entrando al portal (ve su
data y el aviso de mora); `CANCELLED` o `active=false`, no.

**Endurecimiento de Better Auth** que vino con esto: `disableSignUp: true`
(antes `/api/auth/sign-up/email` estaba abierto y cualquier cuenta creada así era
tratada como operador), `allowUserToCreateOrganization: false` y
`disableOrganizationDeletion: true`. Las cuentas se crean por `auth/users.ts`
(`internalAdapter.createUser` + cuenta `credential`, como el plugin `admin`), que
usan `scripts/create-operator.ts` y el panel.

**Alta de usuarios del portal** (`admin-users.service.ts`, pestaña
**Usuarios** del negocio): el operador crea la cuenta y recibe una contraseña
temporal de 16 caracteres que se muestra **una sola vez**, con un mensaje listo
para pegar en WhatsApp. También: cambiar rol, generar contraseña nueva (cierra
las sesiones abiertas) y quitar acceso (si el usuario se queda sin negocio, se
borra). Todo audita (`business.user.*`). Los negocios sin organización espejo
(los anteriores al panel) la reciben al crear su primer usuario.

**API del portal** (`routes/portal.route.ts`): `GET /portal/me`,
`/portal/appointments`, `/portal/customers`, `/portal/customers/:id`,
`/portal/conversations` y, solo dueño, `/portal/usage`, `/portal/transactions`,
`/portal/gift-cards`. Reusa los servicios de `admin-activity`/`admin-metrics`;
lo nuevo es el CRM de clientas (`portal.service.ts`: citas, citas efectivas,
total gastado y última visita por clienta, e historial).

**Panel**: `/` reparte por rol (operador → `/dashboard`, cliente → `/portal`).
`app/portal/*`: Hoy (agenda del día, pendientes de pago, saldo a cobrar en el
local, próximos 7 días), Citas, Clientas (+ ficha), Conversaciones y, para el
dueño, Métricas, Pagos y Gift cards. El portal toma el color primario y el logo
de la pestaña Marca. Las tablas de actividad y la vista de consumo se
extrajeron a `components/` y las comparten el operador y el portal.

**Pendiente de F7**: transcripción de conversaciones (hoy solo el estado de la
máquina; hace falta una tabla de mensajes), acciones del recepcionista sobre las
citas (marcar completada / no asistió), 2FA y cambio de contraseña desde el
propio portal, y que el dueño administre a su equipo sin pasar por el operador.

---

## 9. Seguridad

- **Auth del panel (Better Auth, D11)**: el panel puede suspender negocios reales
  y guarda llaves API de terceros. Nada al nivel del `STAFF_PIN`. En v1: un solo
  usuario `operator` con contraseña fuerte + **2FA** (plugin de Better Auth).
  El panel corre en Vercel y el backend en Railway → la sesión se valida en el
  backend en **cada** request a `/admin/*` (cookie de sesión con dominio
  compartido, o bearer token verificado server-side en el route handler de
  Next.js antes de llamar al backend). CORS de `/admin/*` restringido al dominio
  del panel; rate-limit propio. Evaluar IP allowlist para el operador.
- **Aislamiento por tenant**: el guard de `/admin/*` filtra por `businessId`
  según la organización de la sesión desde F0 (aunque en v1 el `operator` las vea
  todas). Los tests de F7 verifican que un rol de cliente no cruce de tenant.
- **Cifrado de secretos por-tenant**: tokens de WhatsApp y llaves de Wompi
  cifrados en reposo. Cifrado a nivel de aplicación (AES-GCM con clave en env de
  Railway) en los repositorios, o `pgcrypto`. Prisma no cifra campos solo.
  Definir rotación de la clave maestra.
- **`AuditLog`**: registrar toda suspensión, reactivación y cambio de
  credenciales con actor + timestamp + antes/después.
- **Separación de despliegue**: el panel va en **Vercel** con su propio dominio
  (p.ej. `panel.tudominio`), separado del backend en Railway. El backend expone
  `/admin/*` solo para ese origen (CORS + auth); el resto de la API pública no
  cambia.

---

## 10. Fases de ejecución

| Fase | Qué | Depende de | Se puede empezar |
|---|---|---|---|
| **M-1** | **Formalizarse**: matrícula mercantil (Cámara de Comercio) + RUT, o crear una SAS. Prerrequisito de M0. | — | **ahora** (D7) |
| **M0** | Verificación de negocio en Meta + App Review (Advanced Access `whatsapp_business_*`) | M-1 | tras M-1 (crítico, semanas de espera) |
| **F0** | ✅ **hecho** (en `main`). **Monorepo** (Turborepo + pnpm, `apps/backend` + `packages/db`) — mergeado y deploy en Railway verificado en verde. **Modelo de datos**: `Business.status`/`chargeMode`/`depositPercentage`/branding, pago parcial en `Appointment`, y `WhatsAppAccount`, `PaymentCredentials`, `SubscriptionPlan`, `OperatorInvoice`, `OperatorPayment` (+ join), `ClientContact`, `AuditLog` — migración `20260903194848_panel_operador_data_model`. **Cifrado de secretos**: `apps/backend/src/utils/crypto.ts` (AES-256-GCM, `SECRETS_ENCRYPTION_KEY`), columnas `*_enc`. Tablas de Better Auth se difieren a F3. | — | ✅ |
| **F1** | ✅ **hecho** (en `main`). Guard único de `status` (`business-guard.ts`) en reservas web/API, gift cards nuevas y herramientas del agente; suspensión suave (mensaje único) y silencio en WhatsApp. Resolución de tenant del webhook: parser extrae `phone_number_id`, se resuelve por `whatsAppAccountRepository` con fallback al número display (F4 puebla `whatsapp_accounts`). | F0 | ✅ |
| **F2** | ✅ **hecho** (en `main`). `paymentCredentials.repository` (cifra/descifra), `resolveProviderForBusiness` con fallback a env, `getPaymentProviderForCredentials`. Webhook multi-comercio (`extractWebhookReference` → Payment → credenciales del negocio → valida firma). Branch `TOTAL`/`DEPOSIT` en `createPayment` (split guardado al crear el link), `confirmIfPending` → `DEPOSIT_PAID`, mensajes con abono/saldo en bot/agente/confirmación/`/gracias`/formulario. Script `script:demo-payment-credentials`. | F0 | ✅ |
| **F3** | ✅ **hecho** (en `main`). F3a: Better Auth en el **backend** (`/api/auth/*`, plugins `bearer`+`twoFactor`+`organization`), guard `requireOperatorSession` en `/admin/*`, `packages/shared`. F3b: **`apps/panel`** (Next 16 + Tailwind v4 + shadcn a mano) — login, shell protegido, **proxy BFF** `app/api/auth/[...all]` (chequeo same-origin propio; el `Origin` real viaja en `x-forwarded-origin` — el fetch de Next no reenvía `Origin`; el backend lo valida contra `trustedOrigins`). Fix `account.issuer` (CLI 1.4.x < core 1.7.2) → migración `..._better_auth_account_issuer`. F3c: **CRUD de negocios** + `Organization` espejo + `AuditLog`. F3d: **marca + checklist de onboarding** (§6.1). F3e: **dashboards y control de clientes** — `/admin/metrics/overview` (MRR, cobrado, pendiente, vencido, vencimientos, consumo agregado), `.../usage` por negocio, listados de actividad (citas, pagos, conversaciones, gift cards), contactos (CRM), bitácora `/admin/audit-logs`, y transiciones de estado con motivo (`POST .../status`). | F0, F1 | ✅ |
| **F4** | 🟡 **a medias**. ✅ Envío por-tenant: `resolveWhatsAppProviderForBusiness` toma las credenciales del negocio (`whatsapp_accounts`, token cifrado) con fallback a las env; lo usan notificaciones, bot de menús y agente. `getWhatsAppWebhookReader` valida firma y parsea sin exigir credenciales globales. ✅ Alta manual del número desde el panel (puente §7.3) con rotación de token, verificación contra la Graph API (calidad y límite de mensajería) y desconexión. ✅ **Embedded Signup construido** (§7.4): canje del `code`, suscripción a la WABA, registro en Cloud API y enlace de auto-conexión de un solo uso para el cliente (`/conectar/:token`) — llega apagado y se enciende con `META_APP_ID` + `META_EMBEDDED_SIGNUP_CONFIG_ID` cuando Meta apruebe. ⏳ Falta la gestión de perfil/nombre visible — bloqueado por M0. | F0, F1, F3, **M0 aprobado** (⇒ M-1) | 🟡 el resto, cuando Meta apruebe |
| **F5** | ✅ **hecho** (en `main`). `SubscriptionPlan` por negocio (alta, edición, extensión de vigencia). Cuentas de cobro con consecutivo `CC-<año>-NNN` bajo advisory lock, armadas desde el plan o con líneas manuales; enviar/anular con motivo. Pagos recibidos en una transacción que salda cuentas, extiende `validUntil` y reactiva al moroso. PDF de cuenta y recibo (Puppeteer → Storage, marca del operador en `OPERATOR_*`). Ciclo diario idempotente (`billing-cycle.service`): emite 5 días antes, marca vencidas, pasa a mora y suspende al agotarse la gracia — cron 6:00 en `APP_TIMEZONE` + `POST /internal/jobs/billing-cycle`. | F0, F3 | ✅ |
| **F6** | 🟡 **a medias**. ✅ Métricas de uso por cliente (citas por estado y canal, volumen transaccionado, abonos, conversaciones, gift cards, serie diaria, top de servicios) en `/admin/businesses/:id/usage` y la pestaña Consumo. ⏳ Falta: recordatorios automáticos de vencimiento al operador y Google Sheets por-tenant. | F3 | 🟡 |
| **F7** | 🟡 **a medias** (§8.6). ✅ F7a: `user.role` (`operator`/`client`) + signup público cerrado; `requireOperatorSession` exige `operator`; `requirePortalSession` saca el tenant de la membresía. API `/portal/*` (citas, clientas, conversaciones; pagos, gift cards y métricas solo para el dueño). Usuarios del portal administrados por el operador (pestaña **Usuarios**, contraseña temporal sin correo). Portal en `apps/panel/app/portal` con la marca del negocio. Tests de aislamiento de tenant. ⏳ Falta: transcripción de conversaciones (tabla de mensajes), acciones del recepcionista sobre citas, 2FA y cambio de contraseña desde el portal. | F3, F6 | 🟡 |

---

## 11. Riesgos y temas abiertos

- **Formalización (M-1) es el primer cuello de botella.** Sin matrícula mercantil
  + RUT no hay verificación de negocio en Meta, y sin ella no hay Embedded Signup
  (D1) ni Advanced Access. Camino: registrarse como persona natural con
  establecimiento de comercio en la Cámara de Comercio (rápido y barato) o crear
  una SAS. Mientras tanto, el puente de §7.3 permite operar 1–2 clientes.
- **Meta App Review es el camino crítico** una vez formalizado. Si se rechaza o
  demora, F4 se corre. Mitigación: el interino de §7.3 y arrancar M0 apenas
  esté M-1.
- **Límites de negocio no verificado**: hasta que M0 pase, la WABA del operador
  tiene tope de números y de mensajería (típicamente 2 números / 250
  destinatarios por día). El puente de §7.3 no escala más allá de eso.
- **Nombre visible de WhatsApp**: aprobación por Meta, por número. Un cliente con
  nombre no reconocible o marca ajena puede ser rechazado.
- **Número ya registrado**: si el número del cliente ya está en la app de
  WhatsApp (personal o Business), hay que migrarlo/desregistrarlo. Fricción común
  en el onboarding.
- **Calidad y límites de mensajería** son por número; un cliente que mande spam
  no arrastra a los demás, pero sí puede quedar limitado él.
- **Sprawl de secretos**: cada negocio suma un token de WhatsApp + 4 llaves de
  Wompi cifradas. Necesita historia de rotación y respaldo de la clave maestra.
- **DIAN**: los "recibos internos" no son facturas legales. Si el operador debe
  facturar formalmente empresa-a-empresa, en algún momento entra facturación
  electrónica (Alegra, Siigo, Factus…). Fuera de v1.
- ~~**`ARCHITECTURE.md`** contradice este plan ("sin dashboard") y asume un solo
  paquete.~~ Resuelto: documenta el monorepo y las tres superficies de interfaz.
- **Migración a monorepo (F0)**: toca imports en todo el backend y el
  build/start command del servicio de Railway. Riesgo bajo pero hay que hacerlo
  de golpe y verificar el deploy antes de seguir.
- **Panel fuera de la red privada de Railway**: al estar en Vercel, todo el
  tráfico del panel al backend va por internet público. Mitigación: `/admin/*`
  con CORS restringido + auth Better Auth en cada request + rate-limit. El
  Postgres nunca se expone (D10).
- **Realtime de conversaciones**: SSE o polling desde el backend para F7;
  decidir al llegar. Un servicio tipo Ably/Pusher es plan B si el volumen crece.
- **Costo de infra**: el panel en Vercel (plan Hobby/Pro) + Better Auth sobre el
  Postgres existente. Menos carga en Railway que la opción Directus descartada.

---

## 12. Qué se necesita del operador antes de empezar

| Ítem | Estado |
|---|---|
| **Planes** (nombres, precios, ciclo, gracia) | ✅ definidos — §6.5 (prueba 7d / mensual $50.000 / gracia 3d) |
| **Plantilla de cuenta de cobro / recibo** | ✅ referencia en `docs/assets/factura-referencia.webp`, estructura en §6.5 |
| **Formalización** (matrícula mercantil + RUT, o SAS) | ⏳ pendiente — bloquea M0/F4 (D7, §11) |
| Datos legales para verificación de Meta | ⏳ tras formalizarse |
| Datos de la cuenta bancaria / Nequi del operador (van en la cuenta de cobro) | ⏳ pendiente |
| Marca del operador (nombre, logo, colores para la cuenta de cobro y el panel) | ⏳ pendiente |
| Stack del panel (monorepo · Next.js · shadcn · Better Auth · Vercel) | ✅ decidido — §8 (D9–D11) |
| Cuenta de Vercel + dominio del panel (p.ej. `panel.tudominio`) | ⏳ pendiente |

## 13. Nota sobre formalización (D7)

El operador es persona natural sin registro. Impacto:

- **Meta**: sin matrícula mercantil + RUT no se completa la verificación de
  negocio → sin Embedded Signup ni Advanced Access. Es el prerrequisito M-1.
- **Documento de cobro**: se emite **cuenta de cobro** (válida para persona
  natural no responsable de IVA), no factura. Sin línea de impuestos. Cuando el
  operador se registre y/o sea responsable de IVA, se cambia el título a
  "Factura de venta", se agrega IVA y — si aplica — facturación electrónica DIAN
  (Alegra / Siigo / Factus). El modelo `OperatorInvoice` ya deja el campo
  `impuestos` para ese momento.
- **Recaudo**: cobrar por transferencia / Nequi / Daviplata a cuenta personal
  está bien a esta escala. No hay tema de intermediación porque el operador solo
  cobra su propio servicio (la plata de los spas nunca pasa por él — D3).
