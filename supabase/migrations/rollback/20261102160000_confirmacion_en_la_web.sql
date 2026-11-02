-- Rollback de 20261102160000_confirmacion_en_la_web.sql
--
-- Vuelve a cerrar la confirmación en la web: fuera las dos puertas que usa el
-- formulario. No hay datos que recuperar: la migración no escribe ninguno, y
-- las confirmaciones que se hayan guardado se quedan donde están.

drop function if exists public.registrar_confirmacion(text, jsonb);
drop function if exists public.obtener_invitacion(text);
