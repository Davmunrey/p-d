-- Rollback de 20260811140400_correcciones_recuento.sql
--
-- La vista primero: cuelga de la tabla y el borrado fallaría al revés.
-- `v_alergias_por_mesa` ya no se crea aquí —la publica la migración de mesas—
-- así que se deshace con la suya y no con ésta.

drop view if exists public.v_recuento_catering;

drop policy if exists correcciones_recuento_escribir on public.correcciones_recuento;
drop policy if exists correcciones_recuento_leer on public.correcciones_recuento;

drop table if exists public.correcciones_recuento;
