# Testing & Hardening

Fase 10 del roadmap. Ver `docs/ARCHITECTURE.md` para las decisiones de diseño
que estos tests verifican.

## Cómo correr los tests

```bash
npm test          # suite completa (Vitest)
npm run test:watch
npm run typecheck
npm run lint
npm run build      # confirma que el build de producción compila y produce
                    # dist/app.js y dist/server.js en la raíz de dist/
```

No requieren una base de datos real: `tests/setup.ts` fija variables de
entorno falsas pero válidas contra `src/config/env.ts` antes de importar
cualquier módulo de la app.

## Estructura

- `tests/unit/` — un archivo por servicio/módulo. Mockean repositorios e
  integraciones externas (`vi.mock`) para probar la lógica de negocio en
  aislamiento; nunca llaman a Supabase, WhatsApp ni al proveedor de pago real.
- `tests/integration/routes.test.ts` — levanta la app completa (`buildApp()` +
  `app.inject`) con los *services* mockeados a nivel de módulo, para probar el
  cableado HTTP (validación de body, códigos de estado, headers) sin
  reimplementar la lógica de negocio que ya prueban los unitarios.

Patrón para capturar una llamada dentro de `prisma.$transaction` (usado para
verificar que el advisory lock de la sección 12 realmente se toma, no solo
que el resultado final es correcto): declarar el mock del lock con
`vi.hoisted()` *antes* de `vi.mock("../../src/db/prisma.js", ...)`, porque
Vitest hoistea las llamadas a `vi.mock` sobre cualquier `const` normal del
archivo. Ver `tests/unit/appointment.test.ts` y `tests/unit/payment.test.ts`.

## Cobertura por sección del prompt maestro (33)

| Caso | Dónde |
|---|---|
| Crear cliente (dedup por teléfono) | `appointment.test.ts` |
| Crear reserva | `appointment.test.ts` |
| Comprobar disponibilidad | `availability.test.ts` |
| Detectar conflicto de horario | `appointment.test.ts` |
| Crear payment | `payment.test.ts` |
| Procesar webhook | `payment.test.ts`, `whatsapp-provider.test.ts` |
| Confirmar reserva | `payment.test.ts` |
| Expirar reserva | `appointment.test.ts` |
| Generar Gift Card | `gift-card.test.ts` |
| Validar Gift Card | `gift-card.test.ts` |
| Canjear Gift Card | `gift-card-redeem.test.ts` |
| Impedir doble canje | `gift-card-redeem.test.ts` |
| Procesar webhook duplicado | `payment.test.ts` (idempotencia por `reference`) |
| Recordatorios (Fase 9) | `appointment.test.ts`, `notification.test.ts` |

## Qué NO está cubierto por la suite automática

**Concurrencia real (sección 12).** Los unitarios mockean
`prisma.$transaction`/`$executeRaw`, así que solo verifican que el código
*intenta* tomar el advisory lock con la clave correcta — no pueden probar que
Postgres efectivamente serializa dos transacciones concurrentes (eso
requeriría una base de datos real dentro de la suite, que este proyecto
decidió no montar para el MVP — sección 46). Verificado manualmente en vivo
contra Supabase (ver `docs/ARCHITECTURE.md`, "Modelo de recursos"): de dos
reservas concurrentes al mismo slot con `capacity=1`, una recibe `201` y la
otra `409 AVAILABILITY_ERROR`. Repetir esa verificación manual si se toca
`createAppointment`, `confirmAppointmentAfterPayment` o el trigger SQL de
capacity.

**Integraciones externas reales** (WhatsApp Cloud API, Wompi, Google Sheets,
Supabase Storage) — cada `docs/*.md` respectivo documenta cómo se probaron en
vivo la primera vez; la suite automática las mockea siempre.

## Hallazgos de hardening (Fase 10) y cómo se corrigieron

Encontrados corriendo la app compilada (`npm run build && node dist/server.js`
equivalente vía `app.inject`) en vez de solo la suite de tests, que por sí
sola no los habría detectado:

1. **`@fastify/static@8.3.0` con 4 CVEs (path traversal / bypass de
   autorización), severidad alta.** Actualizado a `^10.1.3` (`npm audit`
   limpio para dependencias de producción). Verificado que `/reservar`,
   `/regalar`, `/gracias`, `/validar` y los assets de `/css`/`/js` se siguen
   sirviendo igual, y que intentos de path traversal (`..%2f`, `%2e%2e`)
   siguen devolviendo `404`.
2. **El build de producción no arrancaba.** `tsconfig.json` tenía
   `rootDir: "."`, así que `tsc` compilaba a `dist/src/app.js` en vez de
   `dist/app.js` — `npm start` (`node dist/server.js`) y el `CMD` del
   Dockerfile apuntaban a un archivo que no existía, y aunque hubieran
   apuntado bien, `WEB_DIR` (`src/app.ts`) habría resuelto a `dist/web` en vez
   de `web/`, sirviendo 404 en todo el frontend. Corregido con
   `tsconfig.build.json` (nuevo, `rootDir: "src"`, solo para `npm run build`)
   — `tsconfig.json` sigue cubriendo `src/`, `prisma/seed.ts` y `tests/` para
   `npm run typecheck`.
3. **Un cliente rate-limited recibía `500 INTERNAL_ERROR` en vez de `429`.**
   `errorHandler` solo distinguía `AppError`/`ZodError`; cualquier otro error
   con su propio `statusCode` (como el que lanza `@fastify/rate-limit`, o un
   `403 Forbidden` de `@fastify/static` al pedir un directorio sin index cae
   al 500 genérico y se registraba como `unhandled_error` — ruido en el
   monitoreo para tráfico esperado. Se agregó un branch que pasa el
   `statusCode` de errores 4xx de plugins de Fastify en vez de colapsarlos a
   500.
4. **`STAFF_PIN` (canje de Gift Cards, sección 16) comparado con `!==`.** Dos
   problemas: comparación no es de tiempo constante (timing attack teórico
   sobre un PIN de 4-6 dígitos), y el rate limit global (100/min) no evita
   fuerza bruta de un PIN corto en un tiempo razonable. Se agregó
   `secureCompare()` (`crypto.timingSafeEqual`, usado también para
   `INTERNAL_JOBS_TOKEN`) y un rate limit propio y más estricto (5/min) en
   `POST /api/gift-cards/redeem`.
5. **La imagen Docker de producción incluía devDependencies** (`vitest`,
   `vite`, `esbuild` — con una vulnerabilidad moderada conocida del dev server
   de esbuild), porque `npm ci` corría antes de que `NODE_ENV=production`
   estuviera seteado. Se agregó `npm prune --omit=dev` al final del stage
   `build`, y `runtime` copia `node_modules` desde ahí en vez de desde `deps`.
6. **Faltaba `.dockerignore`.** `COPY . .` en el stage `build` habría incluido
   un `.env` real (si existiera en el contexto de build) en una capa de la
   imagen — un secreto horneado en el historial de capas aunque el stage
   final no lo copie explícitamente. Se agregó `.dockerignore` (mismo
   criterio que `.gitignore`, más `tests/`).

No se corrió `docker build` en este sandbox (sin daemon de Docker
disponible) — validar el Dockerfile actualizado en la Fase 11 antes de
desplegar.
