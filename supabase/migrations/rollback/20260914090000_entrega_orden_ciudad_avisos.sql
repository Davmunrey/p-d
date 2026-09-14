-- Rollback de 20260914090000_entrega_orden_ciudad_avisos.sql
--
-- Devuelve las secciones a su orden anterior —con la misma cautela que la
-- ida: sólo si siguen donde las dejó la migración— y saca la ciudad y los
-- avisos de la vista pública.
--
-- LAS COLUMNAS SE QUEDAN. La ciudad y los avisos los escribió una persona y no
-- están en ningún otro sitio: tirarlos al deshacer un despliegue es perder
-- texto, no revertir código. Fuera de la vista ya no se publican, que es lo
-- que importaba. Si de verdad sobran, se borran a continuación y a conciencia:
--
--   alter table public.configuracion_boda
--     drop column ciudad_ceremonia, drop column avisos_programa;

begin;

update public.secciones_landing set orden = 30
 where seccion = 'galeria' and orden = 36;

update public.secciones_landing set orden = 50
 where seccion = 'transporte' and orden = 60;

update public.secciones_landing set orden = 60
 where seccion = 'alojamiento' and orden = 50 and not exists (
   select 1 from public.secciones_landing where seccion <> 'alojamiento' and orden = 60
 );

alter table public.configuracion_boda
  drop constraint if exists configuracion_ciudad_ceremonia_longitud,
  drop constraint if exists configuracion_avisos_programa_forma;

drop function if exists public.avisos_programa_validos(text[]);

/*
  SE TIRA Y SE VUELVE A CREAR, no vale `create or replace`: la migración le
  añadió dos columnas al final y `create or replace view` sabe añadir columnas
  pero no quitarlas. Tirarla se lleva sus permisos, así que se vuelven a
  conceder abajo — sin eso la landing se queda sin poder leer su configuración.
*/
drop view if exists public.v_configuracion_publica;

create view public.v_configuracion_publica
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
  c.frase_paisaje
from public.configuracion_boda as c;

comment on view public.v_configuracion_publica is
  'Lo que la landing necesita para pintarse. Las columnas van enumeradas aunque '
  '`configuracion_boda` sea publicable entera: es la disciplina que impide que '
  'una columna añadida mañana aparezca sola en la web.';

grant select on public.v_configuracion_publica to anon, authenticated;

commit;
