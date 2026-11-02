-- Rollback de 20261102180000_search_path_fijo_en_todas.sql
--
-- Vuelve a dejar la función con el search_path de la sesión, como estaba.
alter function public.avisos_programa_validos(text[]) reset search_path;
