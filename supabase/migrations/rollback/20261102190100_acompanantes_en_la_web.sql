-- Rollback de 20261102190100_acompanantes_en_la_web.sql
--
-- Las dos puertas del «¿Venís con alguien?» se van; los acompañantes que se
-- hubieran apuntado desde la web se quedan en la base, como cualquier otro.
drop function if exists public.quitar_acompanante(text, uuid);
drop function if exists public.anadir_acompanante(text, text, text, boolean);
