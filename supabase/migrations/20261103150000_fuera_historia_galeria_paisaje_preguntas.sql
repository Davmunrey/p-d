-- ============================================================================
-- Fuera historia, galería, paisaje y preguntas frecuentes
--
-- Los novios han decidido que la web no lleve estas cuatro secciones, y
-- «ubicaciones» nunca llegó a construirse. Estaban encendidas y vacías —sin
-- una sola fila en producción—, así que no se pierde nada visible. Se quitan
-- del todo para que el panel no ofrezca rellenar lo que no va a salir:
--
--   · las filas de `secciones_landing` y las fotos de esas secciones;
--   · las tablas `hitos_historia` y `preguntas_frecuentes`;
--   · las tres líneas del paisaje de `configuracion_boda`, y su hueco en la
--     vista pública.
--
-- LOS VALORES DEL ENUMERADO SE QUEDAN. PostgreSQL no sabe quitar un valor de
-- un enumerado sin rehacer el tipo, y `seccion_landing` lo usan dos tablas,
-- funciones y políticas. En su lugar, un CHECK en cada tabla impide que una
-- fila vuelva a usarlos; el código los lista como retirados
-- (`SECCIONES_RETIRADAS`).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Las filas
-- ---------------------------------------------------------------------------

delete from public.secciones_landing where seccion::text in ('paisaje', 'historia', 'galeria', 'ubicaciones', 'preguntas_frecuentes');
delete from public.medios where seccion::text in ('paisaje', 'historia', 'galeria', 'ubicaciones', 'preguntas_frecuentes');

-- ---------------------------------------------------------------------------
-- 2. Que no vuelvan
-- ---------------------------------------------------------------------------

alter table public.secciones_landing
  drop constraint if exists secciones_landing_seccion_vigente;
alter table public.secciones_landing
  add constraint secciones_landing_seccion_vigente
    check (seccion::text not in ('paisaje', 'historia', 'galeria', 'ubicaciones', 'preguntas_frecuentes'));

alter table public.medios
  drop constraint if exists medios_seccion_vigente;
alter table public.medios
  add constraint medios_seccion_vigente
    check (seccion::text not in ('paisaje', 'historia', 'galeria', 'ubicaciones', 'preguntas_frecuentes'));

-- ---------------------------------------------------------------------------
-- 3. Las tablas de la historia y de las preguntas
-- ---------------------------------------------------------------------------

drop table if exists public.hitos_historia;
drop table if exists public.preguntas_frecuentes;

-- ---------------------------------------------------------------------------
-- 4. El paisaje
-- ---------------------------------------------------------------------------

/*
  LA VISTA SE TIRA Y SE VUELVE A CREAR: `create or replace` no sabe quitar
  columnas, y mientras la vista las publique no se pueden borrar de la tabla.
  Tirarla se lleva sus permisos, así que se vuelven a conceder.
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

alter table public.configuracion_boda
  drop constraint if exists configuracion_paisaje_intro_longitud,
  drop constraint if exists configuracion_paisaje_titulo_longitud,
  drop constraint if exists configuracion_paisaje_cierre_longitud,
  drop column if exists paisaje_intro,
  drop column if exists paisaje_titulo,
  drop column if exists paisaje_cierre;

commit;
