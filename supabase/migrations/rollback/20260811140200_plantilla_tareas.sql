-- Rollback de 20260811140200_plantilla_tareas.sql
--
-- Deshace la plantilla y su rastro, pero NO las tareas ya generadas: a esas
-- alturas son tareas de la boda como cualquier otra, con su estado y su
-- responsable, y borrarlas se llevaría trabajo real. La clave ajena es
-- `on delete set null`, así que quitar la tabla las deja huérfanas de
-- plantilla y de nada más.

drop function if exists public.generar_tareas_desde_plantilla(text[]);

drop index if exists public.tareas_plantilla_unica_idx;
alter table public.tareas drop constraint if exists tareas_plantilla_id_fk;
alter table public.tareas drop column if exists plantilla_id;

drop policy if exists plantilla_tareas_escribir on public.plantilla_tareas;
drop policy if exists plantilla_tareas_leer on public.plantilla_tareas;

drop table if exists public.plantilla_tareas;
