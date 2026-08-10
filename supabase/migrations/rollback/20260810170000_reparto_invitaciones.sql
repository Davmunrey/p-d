-- Rollback de 20260810170000_reparto_invitaciones.sql
--
-- OJO: quitar las columnas borra el registro de a quién se le mandó ya la
-- invitación. No es un dato que se pueda reconstruir —vive en el WhatsApp de
-- quien organiza— así que, si hay repartos anotados, conviene copiárselos antes
-- de ejecutar esto:
--
--   select nombre, invitacion_enviada_en, recordatorio_enviado_en
--     from public.grupos_invitacion
--    where invitacion_enviada_en is not null;

drop function if exists public.marcar_invitacion_repartida(uuid, boolean);

alter table public.grupos_invitacion
  drop column if exists invitacion_enviada_en,
  drop column if exists recordatorio_enviado_en;
