-- Defensa en profundidad para el control de concurrencia (sección 12 del
-- prompt maestro). El chequeo principal ocurre en la aplicación
-- (pg_advisory_xact_lock + recuento de solapes dentro de una transacción, ver
-- src/services/appointment.service.ts); este trigger es la red de seguridad
-- a nivel de base de datos por si algún proceso escribe en `appointments`
-- sin pasar por esa capa.
--
-- NOTA: un EXCLUDE constraint clásico (pairwise, "no dos filas pueden
-- solaparse") no sirve aquí porque `services.capacity` permite varias citas
-- CONFIRMED en paralelo para el mismo servicio (varias sillas/camillas). Se
-- necesita un chequeo que cuente solapes contra la capacidad del servicio,
-- por eso se implementa como trigger en vez de constraint declarativo.

CREATE OR REPLACE FUNCTION check_appointment_capacity() RETURNS trigger AS $$
DECLARE
  service_capacity INTEGER;
  overlapping_count INTEGER;
BEGIN
  IF NEW.status <> 'CONFIRMED' THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO service_capacity FROM services WHERE id = NEW.service_id;

  IF service_capacity IS NULL THEN
    RAISE EXCEPTION 'appointment_capacity_check_failed: service % not found', NEW.service_id;
  END IF;

  SELECT COUNT(*) INTO overlapping_count
  FROM appointments
  WHERE business_id = NEW.business_id
    AND service_id = NEW.service_id
    AND appointment_date = NEW.appointment_date
    AND status = 'CONFIRMED'
    AND id <> NEW.id
    AND start_time::time < NEW.end_time::time
    AND end_time::time > NEW.start_time::time;

  IF overlapping_count >= service_capacity THEN
    RAISE EXCEPTION 'appointment_capacity_exceeded: business_id=%, service_id=%, date=%, start=%, end=%',
      NEW.business_id, NEW.service_id, NEW.appointment_date, NEW.start_time, NEW.end_time
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_appointment_capacity ON appointments;

CREATE TRIGGER trg_check_appointment_capacity
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION check_appointment_capacity();
