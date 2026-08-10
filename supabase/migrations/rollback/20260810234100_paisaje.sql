-- Rollback de 20260810234100_paisaje.sql
--
-- Quita la sección de la landing y devuelve la vista pública a sus columnas de
-- antes.
--
-- LA FRASE SE QUEDA. `frase_paisaje` la escribió una persona y no está en
-- ningún otro sitio: tirarla al deshacer un despliegue es perder texto, no
-- revertir código. Fuera de la vista ya no se publica, que es lo que importaba.
-- Si de verdad sobra, se borra a continuación y a conciencia:
--
--   alter table public.configuracion_boda drop column frase_paisaje;

delete from public.secciones_landing where seccion = 'paisaje';

alter table public.configuracion_boda
  drop constraint if exists configuracion_frase_paisaje_longitud;

/*
  SE TIRA Y SE VUELVE A CREAR, no vale `create or replace`: la migración le
  añadió una columna al final y `create or replace view` sabe añadir columnas
  pero no quitarlas. Tirarla se lleva sus permisos, así que se vuelven a
  conceder abajo — sin eso la landing se queda sin poder leer su configuración y
  la web entera deja de pintarse.
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
  c.idioma_por_defecto
from public.configuracion_boda as c;

comment on view public.v_configuracion_publica is
  'Lo que la landing necesita para pintarse. Las columnas van enumeradas aunque '
  '`configuracion_boda` sea publicable entera: es la disciplina que impide que '
  'una columna añadida mañana aparezca sola en la web.';

grant select on public.v_configuracion_publica to anon, authenticated;
