# Google Sheets

Fase 7 del roadmap. Ver `docs/ARCHITECTURE.md` para el principio general y
`src/integrations/google-sheets/` + `src/services/google-sheets-sync.service.ts`
para el código.

## Principio (sección 2 y 19 del prompt maestro)

Google Sheets es **una vista administrativa, nunca la fuente de verdad**.
Nunca se lee de Sheets para decidir disponibilidad, confirmar pagos ni
validar Gift Cards — todo eso ya vive en Postgres. La sincronización es de
un solo sentido: `backend → Sheets`.

Consecuencia directa: **un fallo de Sheets nunca puede romper una reserva ni
un pago**. `syncAppointmentToSheet` y `syncCustomerToSheet`
(`google-sheets-sync.service.ts`) capturan cualquier error internamente y
solo loggean — igual que `notification.service.ts` en Fase 6. Se llaman con
`void` (sin `await`) desde `appointment.service.ts` y `payment.service.ts`,
fuera de cualquier transacción, para que ni siquiera la latencia de la API de
Sheets retrase la respuesta al cliente.

## Autenticación: Service Account, no OAuth (desviación de la sección 38)

La sección 38 del prompt maestro pide `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
— el patrón de OAuth para apps con usuario interactivo. Un backend desatendido
no tiene ese usuario ni un dashboard para completar el consentimiento
(sección 42: no hay panel admin todavía), y un OAuth sin refresh token
almacenado no puede escribir en Sheets por sí solo.

Se usa en su lugar una **Service Account** de Google Cloud (decisión
confirmada con el usuario en Fase 7):

- `GOOGLE_SERVICE_ACCOUNT_EMAIL` — el email de la cuenta de servicio
  (`...@...iam.gserviceaccount.com`).
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` — la clave privada del JSON descargado
  al crearla.
- `GOOGLE_SHEET_ID` — sin cambios respecto a la sección 38.

Setup (una sola vez, sin dashboard):

1. Google Cloud Console → crear un proyecto (o reusar uno) → habilitar
   **Google Sheets API**.
2. IAM & Admin → Service Accounts → crear una → generar una clave JSON.
3. Del JSON descargado, copiar `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   y `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
4. Abrir el Google Sheet de destino → **Compartir** → agregar el email de la
   cuenta de servicio como **Editor**.

Sin necesidad de OAuth consent screen, sin refresh token que expire o se
revoque — el patrón recomendado por Google para automatización
backend-to-backend.

## Qué se sincroniza

Solo `RESERVAS` y `CLIENTES` (columnas exactas de la sección 19). `GIFT CARDS`
se implementa en Fase 8, cuando exista la entidad que sincronizar — no se
crea la función ahora sin nada que la use (sección 46).

Disparadores (sección 20: "disparado por el backend tras cada cambio de
estado relevante" — aquí sin pasar por n8n, ver más abajo):

- `appointment.service.ts#createAppointment` → sincroniza la reserva nueva
  (`PENDING`) y el cliente (nuevo o existente).
- `payment.service.ts#processPaymentWebhook` → resincroniza la reserva cuando
  el pago la confirma (`CONFIRMED`/`PAID`).

No se sincroniza el caso de expiración (`expireStalePendingAppointments`,
Fase 3/9): actualizaría potencialmente muchas filas a la vez por un evento de
bajo valor para la vista administrativa, y Sheets nunca es fuente de verdad
— queda como una limitación conocida, no un bug.

## `upsertRow`: por qué no hay upsert nativo en Sheets

La API de Sheets no tiene upsert. `GoogleSheetsApiProvider.upsertRow` lo
simula: lee la columna A completa (`{sheet}!A:A`) para encontrar la fila cuyo
ID coincide, y si existe hace `values.update` sobre esa fila exacta; si no,
`values.append`. `ensureSheet` crea la hoja (tab) con encabezados si no existe
todavía, y cachea en memoria cuáles ya confirmó — para no repetir esa consulta
en cada sincronización.

## Probado contra una Service Account y un Sheet reales

Verificado end-to-end: con una Service Account creada en Google Cloud Console
(API de Sheets habilitada, sin rol de proyecto necesario) y el Sheet
compartido con su email como Editor, `ensureSheet` creó las hojas `RESERVAS`
y `CLIENTES` con encabezados automáticamente en el primer sync — no hace
falta crearlas a mano. Se probó también el caso de upsert real: dos reservas
del mismo cliente generaron dos filas en `RESERVAS` (una por cita) pero una
sola fila en `CLIENTES`, actualizada en el segundo sync (`Última reserva` y
`Número de reservas` correctos) — confirma que `upsertRow` actualiza en vez
de duplicar.

## Nota sobre n8n (sección 20)

`docs/ARCHITECTURE.md` describe originalmente que n8n dispara
`06_google_sheets_sync`. Como ya se decidió en Fases 4 y 6 que los webhooks
externos (Wompi, Meta) le hablan directamente al backend sin pasar por n8n,
la sincronización a Sheets sigue el mismo patrón por consistencia: el backend
llama a la API de Google directamente. Si más adelante se introduce n8n para
otros workflows (recordatorios, Fase 9), esta sincronización puede migrar sin
tocar el resto de la aplicación — vive detrás de `GoogleSheetsProvider`.

## Qué falta (fuera de Fase 7)

- Hoja `GIFT CARDS` (Fase 8).
- Sincronizar reservas expiradas/canceladas en bulk.
- Multi-negocio: hoy `GOOGLE_SHEET_ID` es un único spreadsheet (para el
  negocio único activo del MVP); un spreadsheet por negocio requeriría que
  `businesses` guarde su propio `google_sheet_id`.
