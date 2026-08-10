-- ============================================================================
-- BODA-28 · Los medios también pueden ser vídeo
--
-- `medios` nació sabiendo sólo de imágenes. El paisaje pide una vista aérea en
-- bucle, y un vídeo no es una imagen con otra extensión: necesita decir que lo
-- es, y necesita un fotograma quieto.
--
-- EL PÓSTER NO ES UN ADORNO, y por eso es obligatorio. Sirve para tres cosas
-- distintas y ninguna es opcional: es lo que se ve mientras el vídeo carga, es
-- lo que se ve si el navegador se niega a reproducirlo, y —sobre todo— es lo
-- que ve quien ha pedido no ver movimiento. Un vídeo sin póster deja a esa
-- persona con un rectángulo vacío.
--
-- Rollback: supabase/migrations/rollback/20260810235000_medios_video.sql
-- ============================================================================

select public.asegurar_enum('tipo_medio', array['imagen', 'video']);

comment on type public.tipo_medio is
  'Qué clase de medio es. Es un enumerado y no una deducción de la extensión del '
  'fichero: «.mov» y «.mp4» son el mismo vídeo con distinto envoltorio, y adivinar '
  'el tipo mirando el final de una cadena convierte un dato en una heurística.';

alter table public.medios
  add column if not exists tipo public.tipo_medio not null default 'imagen';

comment on column public.medios.tipo is
  'Imagen o vídeo. Por defecto imagen: es lo que había antes de esta columna y '
  'lo que sigue siendo casi todo.';

alter table public.medios
  add column if not exists poster_ruta text;

comment on column public.medios.poster_ruta is
  'El fotograma quieto de un vídeo, dentro del mismo bucket. Es lo que se ve '
  'mientras carga, lo que se ve si el navegador no puede reproducirlo, y lo que '
  've quien pide no ver movimiento.';

/*
  LA RESTRICCIÓN TIENE DOS MITADES, igual que la de `paga_detalle`.

  Sin la primera, un vídeo puede entrar sin póster y quien pidió no ver
  movimiento se queda mirando un hueco.

  Sin la segunda, cambiar un vídeo a imagen deja el póster colgando: la fila
  diría que es una imagen y a la vez llevaría el fotograma de un vídeo que ya no
  está.

  `not valid`: las filas de antes son todas imágenes sin póster, así que ya la
  cumplen — pero no se las obliga a demostrarlo.
*/
alter table public.medios
  drop constraint if exists medios_poster_solo_de_video;

alter table public.medios
  add constraint medios_poster_solo_de_video
  check (
    (tipo = 'video' and poster_ruta is not null
       and public.es_ruta_almacenamiento_valida(poster_ruta))
    or
    (tipo <> 'video' and poster_ruta is null)
  )
  not valid;

/*
  La vista pública enumera sus columnas una a una a propósito, así que añadir
  aquí es la disciplina que impide que una columna nueva salga sola a la web.
  Van al final: `create or replace view` sabe añadir, no reordenar.
*/
create or replace view public.v_medios_publicados
with (security_invoker = on) as
select
  m.id,
  m.ruta_almacenamiento,
  m.texto_alternativo,
  m.seccion,
  m.orden,
  m.ancho,
  m.alto,
  m.marcador_borroso,
  m.tipo,
  m.poster_ruta
from public.medios as m
where m.publicado
order by m.seccion, m.orden;

comment on view public.v_medios_publicados is
  'Fotos y vídeos publicados, ya ordenados por sección. No expone `subido_por` '
  'ni las fechas internas: a la landing no le hacen falta.';
