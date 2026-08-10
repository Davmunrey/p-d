-- Rollback de 20260810200000_correo_confirmacion.sql
--
-- Sólo quita la función. Sin ella el acuse de recibo no encuentra a quién
-- escribir y no se manda nada, que es exactamente lo que hace hoy cuando la
-- ficha no tiene correo: no es un error, es que no hay a quién.

drop function if exists public.destinatarios_confirmacion(text);
