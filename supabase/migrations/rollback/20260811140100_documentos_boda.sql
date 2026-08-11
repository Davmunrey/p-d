-- Rollback de 20260811140100_documentos_boda.sql
--
-- Se lleva la tabla y con ella sus filas. Antes de ejecutarlo conviene anotar
-- en otro sitio qué papeles estaban ya conseguidos y cuándo caducan: esa
-- información no vive en ninguna otra tabla.

drop policy if exists documentos_boda_escribir on public.documentos_boda;
drop policy if exists documentos_boda_leer on public.documentos_boda;

drop table if exists public.documentos_boda;
