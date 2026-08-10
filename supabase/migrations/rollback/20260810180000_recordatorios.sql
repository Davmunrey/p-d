-- Rollback de 20260810180000_recordatorios.sql
--
-- Quita la función y la vista. No toca `recordatorio_enviado_en`, que la crea
-- la migración anterior y guarda a quién se le ha recordado ya: ese dato no se
-- puede reconstruir, vive en el WhatsApp de quien organiza.

drop view if exists public.v_grupos_pendientes;
drop function if exists public.marcar_recordatorio(uuid);
