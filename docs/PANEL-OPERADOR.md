# Panel de operador y evolución multi-cliente

Plan de desarrollo. **Todavía no hay código**: este documento fija decisiones,
modelo conceptual, flujos y fases antes de tocar el repo.

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
| WhatsApp | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (env únicas) | tabla `WhatsAppAccount` por negocio: `wabaId`, `phoneNumberId`, token cifrado |
| Wompi | `PAYMENT_API_KEY`, `PAYMENT_PUBLIC_KEY`, `PAYMENT_INTEGRITY_SECRET`, `PAYMENT_WEBHOOK_SECRET` (env únicas) | ✅ **F2**: tabla `PaymentCredentials` por negocio, cifrada (con fallback a las env) |
| Google Sheets | `GOOGLE_*` + `GOOGLE_SHEET_ID` (env únicas) | config por negocio (opcional, fase tardía) |
| Agente n8n | `SPA_AGENT_TOKEN` compartido, negocio se resuelve por `businessId` | ✅ ya sirve, no cambia |
| Resolución de tenant en el webhook de WhatsApp | por `display_phone_number` | ✅ **F1**: por `phone_number_id` (`whatsAppAccountRepository`) con fallback al número |

> **Nota de arquitectura**: `ARCHITECTURE.md` dice que el backend es "desatendido,
> sin dashboard (sección 42)". Este plan es una **desviación deliberada** de ese
> principio. Además el repo pasa de un solo paquete a **monorepo** (§8.3).
> Actualizar `ARCHITECTURE.md` al implementar F0/F3.

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
| 4. **WhatsApp**: el cliente hace Embedded Signup (login FB → elige/crea WABA y número → autoriza). El backend intercambia el código por token, registra el número y suscribe la app a la WABA | cliente + backend (automático) | panel (botón) → Meta |
| 5. Aprobar nombre visible de WhatsApp y foto de perfil | operador (envía a revisión de Meta) | panel → API de Meta |
| 6. **Wompi**: el operador crea la cuenta en Wompi, pega las 4 llaves, el sistema configura el webhook de Wompi apuntando al backend | operador | panel + dashboard de Wompi |
| 7. Google Sheet (opcional) | operador | panel |
| 8. Plan: nombre, precio, ciclo, `vigenteHasta` | operador | panel |
| 9. Activar → `status: active` | operador | panel |

Lo que **no se puede automatizar** y el panel solo *rastrea*: verificación de
número por OTP, aprobación de nombre visible por Meta, creación de la cuenta de
Wompi.

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

### 7.3 Interino sin verificación (opcional, puente)

Si hace falta arrancar con 1–2 clientes antes de que Meta apruebe: el operador
añade a mano el número de cada cliente **bajo su propia WABA**. Funciona hoy con
el modelo actual extendido a `WhatsAppAccount`, pero el operador posee todo y el
cliente no "hace login" en nada. Tratarlo como puente, no como destino.

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
(el panel es cross-site). Las 7 tablas (`user`, `session`, `account`,
`verification`, `twoFactor`, `organization`, `member`, `invitation`) las genera
`@better-auth/cli generate` y se fusionan a `packages/db/prisma/schema.prisma`
**sin** la convención `@map` snake_case (son contrato con la librería). Único
añadido nuestro: `Organization.businessId` (1:1 con `Business`). El usuario
`operator` se crea con `scripts/create-operator.ts` (no hay signup público).

### 8.4 Qué se construye vs qué solo se configura

| Parte | Enfoque |
|---|---|
| CRUD de negocios, branding, checklist de onboarding, dashboards de cartera e ingresos | **construir** en `apps/panel` (Next.js + shadcn + TanStack Table) contra `/admin/*` |
| Acciones con lógica (suspender en cascada, aprovisionar negocio, aprobar nombre WA) | **construir**: endpoints `/admin/*` en el backend Fastify |
| Callback de Embedded Signup (token exchange, registro de número, suscripción a WABA) | **construir**: endpoint en el backend |
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
| **F3** | En progreso. **F3a hecho** (en `main`): Better Auth montado en el **backend** (`/api/auth/*`, `src/auth/better-auth.ts` — plugins `bearer`+`twoFactor`+`organization`), tablas de auth (migración `..._better_auth`, `Organization.businessId` 1:1 con `Business`), guard `requireOperatorSession` en `/admin/*` + `GET /admin/me`, CORS/credentials para `PANEL_URL`, `packages/shared` (Zod/DTOs, build a `dist/`), scripts `create-operator` / `demo-payment-credentials`. **Pendiente**: F3b panel Next.js (`apps/panel`, BFF), F3c CRUD de negocios, F3d branding + onboarding, F3e dashboards. | F0, F1 | en progreso |
| **F4** | WhatsApp por-tenant: `MetaWhatsAppProvider` toma credenciales del negocio; **integrar Embedded Signup** en el panel (callback, token exchange, suscripción a WABA); gestión de perfil/nombre. | F0, F1, F3, **M0 aprobado** (⇒ M-1) | cuando Meta apruebe |
| **F5** | Facturación: generación recurrente de facturas, PDF de factura y recibo, auto-`past_due`/`suspended` por mora, reactivación al pagar. | F0, F3 | tras F3 |
| **F6** | Extras: métricas de uso por cliente (citas, conversaciones, costo WhatsApp), recordatorios automáticos de vencimiento al operador, Google Sheets por-tenant. | F3 | después |
| **F7** | **Portal de cliente / CRM**: activar roles `client_owner` / `client_staff` en Better Auth, invitaciones, vista de conversaciones del bot en vivo (SSE), citas y métricas por negocio. Tests de aislamiento de tenant. | F3, F6 | cuando el panel del operador esté sólido |

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
- **`ARCHITECTURE.md`** contradice este plan ("sin dashboard") y asume un solo
  paquete. Actualizarlo al hacer F0.
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
