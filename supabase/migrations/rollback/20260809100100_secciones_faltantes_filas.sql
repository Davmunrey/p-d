-- Rollback de 20260809100100_secciones_faltantes_filas.sql
--
-- Retira el programa del día y la playlist de la lista de secciones. La
-- navegación deja de ofrecerlas y la landing deja de pintarlas.
--
-- No borra ningún contenido: los hitos de `hitos_programa` y las canciones de
-- `canciones_sugeridas` siguen donde estaban. Volver a insertar las dos filas
-- las devuelve a la web tal como estaban.

delete from public.secciones_landing where seccion in ('programa', 'playlist');
