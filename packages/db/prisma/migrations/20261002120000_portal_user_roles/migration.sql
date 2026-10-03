-- Portal de cliente (docs/PANEL-OPERADOR.md F7): separa al operador de los
-- usuarios de cada spa. Escrita a mano (sin `prisma migrate dev`) porque
-- DATABASE_URL apunta a la base real: se aplica con `pnpm db:deploy` cuando el
-- operador lo decida.
--
-- Default 'client' para que ningún usuario nuevo nazca operador por omisión.
ALTER TABLE "user" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'client';

-- Hasta hoy el único usuario posible era el operador (v1, un solo rol): todos
-- los existentes lo son. ⚠️ Revisar la tabla `user` antes de desplegar: hasta
-- este cambio el signup público de Better Auth estaba abierto.
UPDATE "user" SET "role" = 'operator';
