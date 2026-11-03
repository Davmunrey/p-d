-- Rollback de 20261103170000_web_abierta.sql
--
-- La vista vuelve a ser la de 20261103150000 y la columna se va. Sin ella, la
-- landing se enseña siempre, como antes.
begin;

-- `create or replace` no sabe quitar columnas: se tira y se vuelve a crear, y
-- con ella se van sus permisos y su comentario, que se vuelven a poner.
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
  c.ciudad_ceremonia,
  c.avisos_programa,
  c.firma_regalos,
  c.lugar_preboda
from public.configuracion_boda as c;

comment on view public.v_configuracion_publica is
  'Lo que la landing necesita para pintarse. Las columnas van enumeradas aunque '
  '`configuracion_boda` sea publicable entera: es la disciplina que impide que '
  'una columna añadida mañana aparezca sola en la web.';

grant select on public.v_configuracion_publica to anon, authenticated;

alter table public.configuracion_boda drop column if exists web_abierta;

commit;
