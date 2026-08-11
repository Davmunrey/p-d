-- Rollback de 20260811140400_correcciones_recuento.sql
--
-- Las vistas primero: cuelgan de la tabla y el borrado fallaría al revés.
-- `v_alergias_por_mesa` no depende de la tabla, pero entró con esta migración
-- y se va con ella.

drop view if exists public.v_recuento_catering;
drop view if exists public.v_alergias_por_mesa;

drop policy if exists correcciones_recuento_escribir on public.correcciones_recuento;
drop policy if exists correcciones_recuento_leer on public.correcciones_recuento;

drop table if exists public.correcciones_recuento;
