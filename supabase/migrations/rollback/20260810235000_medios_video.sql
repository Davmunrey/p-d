-- Rollback de 20260810235000_medios_video.sql
--
-- Devuelve la vista pública a sus columnas de antes y quita la restricción.
--
-- LAS COLUMNAS SE QUEDAN. `tipo` y `poster_ruta` describen ficheros que alguien
-- subió; borrarlas al deshacer un despliegue deja vídeos indistinguibles de
-- imágenes y pósteres huérfanos en el bucket. Fuera de la vista ya no se
-- publican, que es lo que importaba. Si de verdad sobran:
--
--   alter table public.medios drop column poster_ruta;
--   alter table public.medios drop column tipo;
--   drop type public.tipo_medio;
--
-- Ese orden importa: el tipo no se puede borrar mientras una columna lo use.

alter table public.medios
  drop constraint if exists medios_poster_solo_de_video;

/*
  Se tira y se recrea: la migración añadió dos columnas al final y
  `create or replace view` sabe añadirlas pero no quitarlas. Y eso se lleva sus
  permisos por delante, así que se vuelven a conceder abajo — sin ellos la
  landing deja de ver sus fotos.
*/
drop view if exists public.v_medios_publicados;

create view public.v_medios_publicados
with (security_invoker = on) as
select
  m.id,
  m.ruta_almacenamiento,
  m.texto_alternativo,
  m.seccion,
  m.orden,
  m.ancho,
  m.alto,
  m.marcador_borroso
from public.medios as m
where m.publicado
order by m.seccion, m.orden;

comment on view public.v_medios_publicados is
  'Fotos publicadas, ya ordenadas por sección. No expone `subido_por` ni las '
  'fechas internas: a la landing no le hacen falta.';

grant select on public.v_medios_publicados to anon, authenticated;
