# Base de datos

PostgreSQL vía Supabase, gestionado con Prisma. Ver `prisma/schema.prisma` para
el modelo completo y `docs/ARCHITECTURE.md` para las decisiones de diseño.

## Tablas

`businesses`, `services`, `business_hours`, `customers`, `appointments`,
`payments`, `gift_cards` — las 7 tablas mínimas del prompt maestro (sección 6),
más `notification_log` (idempotencia de notificaciones, sección 32).

Adiciones sobre el mínimo del prompt maestro, decididas en Fase 0/3:

- `services.capacity` (int, default 1): citas `CONFIRMED` simultáneas
  permitidas para ese servicio. Sustituye un modelo de "recursos"/personal.
- `businesses.settings` (jsonb): configuración flexible por negocio
  (`gift_card_validity_days`, `reminder_hours_before`) sin tablas nuevas.
- `notification_log`: registro de notificaciones enviadas, con unique
  `(entity_type, entity_id, type)`.

## Migraciones

`prisma/migrations/`:

1. `20260101000000_init` — genera el schema completo. Se generó **sin conexión
   a una base de datos real** con `prisma migrate diff --from-empty
   --to-schema-datamodel prisma/schema.prisma --script`, porque en el momento
   de escribirla no había un proyecto Supabase conectado todavía. Ya fue
   aplicada y verificada contra un proyecto Supabase real (Fase 3).
2. `20260101000001_appointment_capacity_trigger` — función + trigger
   `check_appointment_capacity()` en Postgres puro (no representable en
   `schema.prisma`, por eso vive solo en SQL). Ver docs/ARCHITECTURE.md para
   el porqué de un trigger en vez de una constraint `EXCLUDE`.

Aplicar contra una base nueva:

```bash
npm run prisma:deploy   # aplica migraciones pendientes (producción/staging)
npm run prisma:migrate  # flujo de desarrollo (crea+aplica si hay drift)
npm run prisma:seed     # datos de "Demo Spa"
```

## Convenciones

- `appointment_date` es `DATE` puro; `start_time`/`end_time` son texto
  `"HH:mm"` en hora local del negocio (no timestamps). Toda la aritmética de
  fecha/hora pasa por `src/utils/datetime.ts`.
- `day_of_week` en `business_hours` sigue la convención `0=domingo..6=sábado`.
- Todas las tablas de negocio llevan `business_id` e índices sobre esa columna
  (sección 7). El backend jamás hace una query sin filtrar por `business_id`.
- Row Level Security de Supabase no está habilitado: solo el backend (con
  `SUPABASE_SERVICE_ROLE_KEY`) toca la base de datos en este MVP.
