-- ============================================================================
-- 20260914090000_entrega_orden_ciudad_avisos.sql
-- Tickets: BODA-114 (#143) · BODA-116 (#145)
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero:
--   1. Pone las secciones en el orden de la entrega: alojamiento antes que
--      «cómo llegar», y la galería entre el programa y el alojamiento.
--   2. Añade a `configuracion_boda` la ciudad de la boda y los avisos al pie
--      del programa, y los publica en la vista de la landing.
--
--
-- EL ORDEN SÓLO SE TOCA SI NADIE LO HA TOCADO ANTES.
--
-- `secciones_landing.orden` es de los novios: el día que lo cambien desde el
-- panel, una migración que lo pise sería deshacer una decisión suya sin
-- avisar. Por eso cada `update` lleva el valor que dejó la migración que
-- sembró la fila: si ya no está ahí, es que alguien lo movió, y se respeta.
--
-- Los tres van en una sola transacción y la restricción de unicidad es
-- `deferrable initially deferred` a propósito (ver la migración base): así
-- alojamiento y transporte se permutan sin pasar por un valor de relleno.
--
--
-- LA CIUDAD VA APARTE DE LA DIRECCIÓN.
--
-- La entrega escribe «Nos casamos en León» en la portada, «tres hoteles de
-- León» en el alojamiento y «Finca La Sierra, León» en el pie. De una
-- dirección postal —«Ctra. de la Sierra, km 4 · 24193 León»— no se saca
-- «León» sin adivinar, y adivinar mal en la portada de una boda no tiene
-- arreglo barato. Es un dato de la boda, se escribe una vez en Ajustes.
--
--
-- LOS AVISOS DEL PROGRAMA SON CONTENIDO, NO INTERFAZ.
--
-- «Césped y grava: cuidado con los tacones finos» es de esta finca y de esta
-- fecha, igual que un hito del programa. En `copy.es.json` viviría entre los
-- rótulos de botones, y cambiarlo exigiría un despliegue. Van en un `text[]`
-- —pocos, cortos, ordenados— y no en una tabla: una tabla para dos filas es
-- una tabla que alguien tendrá que ordenar y publicar sin necesitarlo nunca.
--
-- Rollback: supabase/migrations/rollback/20260914090000_entrega_orden_ciudad_avisos.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. El orden de la entrega
-- ---------------------------------------------------------------------------

update public.secciones_landing set orden = 50
 where seccion = 'alojamiento' and orden = 60 and exists (
   select 1 from public.secciones_landing where seccion = 'transporte' and orden = 50
 );

update public.secciones_landing set orden = 60
 where seccion = 'transporte' and orden = 50 and not exists (
   select 1 from public.secciones_landing where seccion <> 'transporte' and orden = 60
 );

-- Entre el programa (35) y las ubicaciones (40): los órdenes se dejaron
-- espaciados justo para poder meter una sección en medio sin renumerar.
update public.secciones_landing set orden = 36
 where seccion = 'galeria' and orden = 30;

-- ---------------------------------------------------------------------------
-- 2. La ciudad y los avisos
-- ---------------------------------------------------------------------------

alter table public.configuracion_boda
  add column if not exists ciudad_ceremonia text,
  add column if not exists avisos_programa text[];

comment on column public.configuracion_boda.ciudad_ceremonia is
  'La ciudad de la boda, para «Nos casamos en León» y las frases que la nombran. '
  'NULL es «no escrita», y entonces la portada enseña la dirección.';

comment on column public.configuracion_boda.avisos_programa is
  'Etiquetas al pie del programa del día, en orden. NULL o vacío: no se pinta '
  'el bloque. Cada una cabe en una etiqueta: son avisos, no párrafos.';

alter table public.configuracion_boda
  drop constraint if exists configuracion_ciudad_ceremonia_longitud,
  drop constraint if exists configuracion_avisos_programa_forma;

/*
  Como mucho seis, ninguno vacío y ninguno más largo que una etiqueta: los
  mismos límites que comprueba la acción del panel, para poder decirlos en
  castellano antes de que salte esto. Va en una función porque un `check` no
  admite subconsultas, y recorrer un array sin `unnest` es reescribir a mano
  lo que Postgres ya sabe hacer.
*/
create or replace function public.avisos_programa_validos(avisos text[])
returns boolean
language sql
immutable
as $$
  select cardinality(avisos) between 1 and 6
     and not exists (
       select 1 from unnest(avisos) as aviso
       where char_length(btrim(aviso)) = 0 or char_length(aviso) > 120
     )
$$;

alter table public.configuracion_boda
  add constraint configuracion_ciudad_ceremonia_longitud
    check (ciudad_ceremonia is null or char_length(btrim(ciudad_ceremonia)) between 1 and 80),
  add constraint configuracion_avisos_programa_forma
    check (avisos_programa is null or public.avisos_programa_validos(avisos_programa));

-- ---------------------------------------------------------------------------
-- 3. Que la landing pueda leerlos
-- ---------------------------------------------------------------------------

/*
  Las columnas van enumeradas una a una aunque `configuracion_boda` sea
  publicable entera: es la disciplina que impide que una columna añadida
  mañana aparezca sola en la web. `create or replace view` sabe añadir
  columnas al final, que es lo único que hace falta aquí.
*/
create or replace view public.v_configuracion_publica
with (security_invoker = on) as
select
  c.nombre_novia,
  c.nombre_novio,
  c.hashtag,
  c.fecha_hora_ceremonia,
  c.fecha_hora_banquete,
  c.zona_horaria,
  c.fecha_limite_rsvp,
  c.lugar_ceremonia,
  c.direccion_ceremonia,
  c.latitud_ceremonia,
  c.longitud_ceremonia,
  c.lugar_banquete,
  c.direccion_banquete,
  c.latitud_banquete,
  c.longitud_banquete,
  c.correo_contacto,
  c.moneda,
  c.idioma_por_defecto,
  c.frase_paisaje,
  c.ciudad_ceremonia,
  c.avisos_programa
from public.configuracion_boda as c;

commit;
