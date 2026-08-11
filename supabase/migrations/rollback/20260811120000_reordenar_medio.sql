-- ============================================================================
-- ROLLBACK de 20260811120000_reordenar_medio.sql
--
-- Sólo se retira la función. No hay datos que deshacer: `reordenar_medio` no
-- crea ni borra filas, permuta el `orden` de dos que ya existían. Volver atrás
-- deja las fotos en el orden en que estuvieran, que es un orden válido — el que
-- eligió quien las movió.
--
-- Lo que sí deja de haber es forma de reordenarlas desde el panel: dos `UPDATE`
-- sueltos por PostgREST chocan contra la unicidad diferida.
-- ============================================================================

drop function if exists public.reordenar_medio(uuid, boolean);
