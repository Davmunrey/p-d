-- ============================================================================
-- ROLLBACK de 20260918100000_reordenar_seccion_landing.sql
-- Ticket: BODA-128 (#166)
--
-- Sólo se retira la función. No hay datos que deshacer: `reordenar_seccion_
-- landing` no crea ni borra filas, permuta el `orden` de dos que ya existían.
-- Volver atrás deja la landing en el orden en que estuviera, que es un orden
-- válido — el que eligió quien lo movió.
--
-- Lo que sí deja de haber es forma de reordenar las secciones desde el panel:
-- dos `UPDATE` sueltos por PostgREST chocan contra la unicidad diferida, porque
-- son dos transacciones y la primera ya deja dos filas con el mismo orden.
-- Volvería a hacerse por SQL, que es de donde venimos.
-- ============================================================================

drop function if exists public.reordenar_seccion_landing(public.seccion_landing, boolean);
