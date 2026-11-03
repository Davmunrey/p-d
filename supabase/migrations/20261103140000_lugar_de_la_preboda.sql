-- ============================================================================
-- El lugar de la preboda
--
-- La víspera ya no tiene horario: la web dice sólo «Preboda en el Barrio
-- Húmedo», bajo la fecha del viernes. Ese sitio es un dato de la boda —se
-- decide, se cambia y lo escriben los novios—, así que vive en
-- `configuracion_boda` y se escribe en Ajustes, como el lugar de la ceremonia.
--
-- NULL es «todavía no se sabe»: mientras esté vacío, la web no enseña la
-- preboda y la confirmación no pregunta por ella.
--
-- Los hitos de la víspera que hubiera en `hitos_programa` (momento
-- `preboda`) NO se borran: dejan de pintarse y de editarse, pero siguen ahí
-- por si algún día vuelve el horario.
-- ============================================================================

begin;

alter table public.configuracion_boda
  add column if not exists lugar_preboda text;

alter table public.configuracion_boda
  drop constraint if exists configuracion_lugar_preboda_longitud;

alter table public.configuracion_boda
  add constraint configuracion_lugar_preboda_longitud
    check (lugar_preboda is null or char_length(btrim(lugar_preboda)) between 1 and 120);

comment on column public.configuracion_boda.lugar_preboda is
  'Dónde es la preboda, escrito como se diría tras «Preboda en» («el Barrio '
  'Húmedo»). NULL es «todavía no se sabe»: la web no enseña la preboda ni la '
  'pregunta al confirmar.';

/*
  LA VISTA SE AMPLÍA AL FINAL, como con la firma de los regalos: `create or
  replace` añade columnas detrás de las que ya tiene y conserva los permisos.
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
  c.paisaje_intro,
  c.paisaje_titulo,
  c.paisaje_cierre,
  c.ciudad_ceremonia,
  c.avisos_programa,
  c.firma_regalos,
  c.lugar_preboda
from public.configuracion_boda as c;

grant select on public.v_configuracion_publica to anon, authenticated;

commit;
