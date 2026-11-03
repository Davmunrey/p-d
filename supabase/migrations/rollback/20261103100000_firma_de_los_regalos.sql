-- Rollback de 20261103100000_firma_de_los_regalos.sql
--
-- La vista se tira y se vuelve a crear sin la firma —`create or replace` no
-- sabe quitar columnas— y se le devuelven sus permisos; después se va la
-- columna. La firma escrita se pierde con ella.
begin;

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
  c.paisaje_intro,
  c.paisaje_titulo,
  c.paisaje_cierre,
  c.ciudad_ceremonia,
  c.avisos_programa
from public.configuracion_boda as c;

comment on view public.v_configuracion_publica is
  'Lo que la landing necesita para pintarse. Las columnas van enumeradas aunque '
  '`configuracion_boda` sea publicable entera: es la disciplina que impide que '
  'una columna añadida mañana aparezca sola en la web.';

grant select on public.v_configuracion_publica to anon, authenticated;

alter table public.configuracion_boda
  drop constraint if exists configuracion_firma_regalos_longitud,
  drop column if exists firma_regalos;

commit;
