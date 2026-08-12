-- Rollback de 20260812090000_documentos_boda.sql
--
-- Se lleva la tabla de documentos y con ella sus filas. Antes de ejecutarlo hay
-- que apuntar en otro sitio qué papeles están pedidos y cuáles caducan: eso lo
-- escribió una persona y no está en ninguna otra parte.
--
-- LOS ENUMERADOS SE QUEDAN. `titular_documento` y `estado_documento_boda` no
-- ocupan nada, no los usa ninguna otra columna una vez tirada la tabla, y
-- borrarlos rompería el reintento de la migración: `asegurar_enum` los crea
-- sólo si no existen, así que dejarlos hace que volver a aplicarla funcione sin
-- limpiar tipos a mano en producción. Si de verdad sobran, se borran a
-- conciencia y después de esto:
--
--   drop type public.estado_documento_boda;
--   drop type public.titular_documento;

drop view if exists public.v_documentos_boda;

drop policy if exists documentos_boda_escribir on public.documentos_boda;
drop policy if exists documentos_boda_leer on public.documentos_boda;

drop table if exists public.documentos_boda;
