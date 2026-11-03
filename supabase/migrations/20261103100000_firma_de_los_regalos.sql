-- ============================================================================
-- La firma del bloque de regalos
--
-- El bloque de regalos de la landing es una carta corta —«no esperamos nada,
-- de verdad…»— y ahora se firma: «Paloma, David y Hati». Es un dato de la boda,
-- no un copy: lleva los nombres de los novios y el de su perra, así que vive en
-- `configuracion_boda` y se escribe en Ajustes, como los nombres.
--
-- NULL es «sin firma»: la carta se queda sin firmar, como estaba.
-- ============================================================================

begin;

alter table public.configuracion_boda
  add column if not exists firma_regalos text;

alter table public.configuracion_boda
  drop constraint if exists configuracion_firma_regalos_longitud;

alter table public.configuracion_boda
  add constraint configuracion_firma_regalos_longitud
    check (firma_regalos is null or char_length(btrim(firma_regalos)) between 1 and 120);

comment on column public.configuracion_boda.firma_regalos is
  'Cómo firman los novios el bloque de regalos de la landing («Paloma, David y '
  'Hati»). NULL es «sin firma»: la carta se pinta sin firmar.';

/*
  LA VISTA SE AMPLÍA AL FINAL. `create or replace` sabe añadir columnas detrás
  de las que ya tiene —no cambiarlas ni quitarlas— y conserva los permisos, así
  que la landing no se queda ni un instante sin poder leer su configuración.
  Las columnas van enumeradas, como siempre: añadir una a la tabla no la
  publica sola.
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
  c.firma_regalos
from public.configuracion_boda as c;

grant select on public.v_configuracion_publica to anon, authenticated;

commit;
