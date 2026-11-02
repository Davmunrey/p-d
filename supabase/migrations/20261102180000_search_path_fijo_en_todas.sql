-- ============================================================================
-- search_path fijo también en la única función que no lo tenía
--
-- El asesor de seguridad de Supabase avisa de `public.avisos_programa_validos`
-- («Function Search Path Mutable»). No es SECURITY DEFINER —por eso la
-- comprobación de `seguridad.sql`, que sólo miraba ésas, no la cazó—, pero
-- vive en un CHECK de `configuracion_boda` y se ejecuta con los privilegios de
-- quien escribe: con el `search_path` de la sesión, un objeto con el mismo
-- nombre que `unnest` o `char_length` en un esquema anterior le cambiaría el
-- significado.
--
-- Vacío es lo más estricto, y le basta: sólo usa funciones de `pg_catalog`,
-- que se busca siempre aunque no esté en la lista.
--
-- Rollback: supabase/migrations/rollback/20261102180000_search_path_fijo_en_todas.sql
-- ============================================================================

alter function public.avisos_programa_validos(text[]) set search_path = '';
