-- ============================================================================
-- BODA-27 · Paisaje: la frase y la sección
--
-- Segunda mitad del par: aquí ya se puede USAR el valor `paisaje` que añadió la
-- migración anterior.
--
-- Rollback: supabase/migrations/rollback/20260810234100_paisaje.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La frase
-- ---------------------------------------------------------------------------

/*
  LA FRASE ES UN DATO DE LA BODA, NO UNA CADENA DE LA INTERFAZ.

  «Todo empezó entre Barcelona y Sevilla y continúa en León» nombra tres
  ciudades concretas: son de esta boda igual que la fecha o el lugar. En
  `copy.es.json` estaría en el sitio de los rótulos —lo que no cambia de una
  boda a otra— y encima obligaría a desplegar para corregir una ciudad.

  VA EN `configuracion_boda` Y NO EN UNA TABLA PROPIA porque es una frase, una
  sola, que existe cero o una vez. Una tabla para una fila es una tabla que
  alguien tendrá que ordenar, paginar y publicar sin necesitarlo nunca.

  SE COMPONE A MANO Y NO DESDE LAS PROCEDENCIAS DE LOS INVITADOS. Se valoró
  construirla con los datos que ya hay; se descartó: la redacción es parte del
  diseño, y «Todo empezó entre Barcelona y Sevilla» no sale de ninguna consulta.
*/
alter table public.configuracion_boda
  add column if not exists frase_paisaje text;

comment on column public.configuracion_boda.frase_paisaje is
  'La frase de la sección de paisaje, bajo la portada. NULL es «todavía no se ha '
  'escrito», y entonces la sección no se pinta: es el mismo criterio que el '
  'resto de la landing, antes ocultar que dejar un hueco.';

/*
  Ni vacía ni un discurso. El mínimo descarta el espacio en blanco que parece
  contenido; el máximo es el sitio que tiene sobre una foto a pantalla completa
  antes de convertirse en un párrafo que nadie lee de pie en el móvil.

  `not valid`: valida de aquí en adelante sin exigirle nada a la fila que ya
  existe, escrita cuando la columna no estaba.
*/
alter table public.configuracion_boda
  drop constraint if exists configuracion_frase_paisaje_longitud;

alter table public.configuracion_boda
  add constraint configuracion_frase_paisaje_longitud
  check (
    frase_paisaje is null
    or char_length(btrim(frase_paisaje)) between 10 and 200
  )
  not valid;

-- ---------------------------------------------------------------------------
-- 2. La sección
-- ---------------------------------------------------------------------------

/*
  En el hueco entre `portada` (0) y `cuenta_atras` (10). Los órdenes se dejaron
  espaciados de diez en diez justo para esto: meter una sección en medio no
  obliga a renumerar las demás, que es la operación en la que se cuela un
  duplicado y salta la restricción de unicidad.
*/
insert into public.secciones_landing (seccion, visible, orden) values
  ('paisaje', true, 5)
on conflict (seccion) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Que la landing pueda leerla
-- ---------------------------------------------------------------------------

/*
  Las columnas de la vista van enumeradas una a una aunque `configuracion_boda`
  sea publicable entera: es la disciplina que impide que una columna añadida
  mañana aparezca sola en la web. Por eso añadir la frase exige tocar esto —y
  por eso está bien que lo exija.

  Va al final: `create or replace view` sabe añadir columnas, pero no cambiar el
  orden ni el tipo de las que ya están.
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
  c.frase_paisaje
from public.configuracion_boda as c;

comment on view public.v_configuracion_publica is
  'Lo que la landing necesita para pintarse. Las columnas van enumeradas aunque '
  '`configuracion_boda` sea publicable entera: es la disciplina que impide que '
  'una columna añadida mañana aparezca sola en la web.';
