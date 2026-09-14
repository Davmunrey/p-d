-- ============================================================================
-- 20260914120000_paisaje_tres_lineas.sql
-- Ticket: BODA-117 (#146)
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero: parte la frase del paisaje en las TRES LÍNEAS que
-- escribe la entrega, y las publica en la vista que lee la landing.
--
--
-- POR QUÉ TRES COLUMNAS Y NO UNA FRASE.
--
-- La entrega no escribe una frase: escribe tres líneas con tres tipografías,
-- tres tamaños y tres colores distintos — una versalita pequeña en marino
-- claro («Todo empezó entre»), un titular enorme en serif blanco («Barcelona y
-- Sevilla») y un cierre en cursiva bronce («y continúa en León»). Con un solo
-- campo de texto no hay forma de saber dónde corta cada línea, y partirlo por
-- palabras sería adivinar: «Todo empezó entre Barcelona y Sevilla» no se
-- rompe por la mitad en ningún sitio que un programa pueda encontrar.
--
--
-- SE RENOMBRA, NO SE TIRA Y SE VUELVE A CREAR.
--
-- `frase_paisaje` pasa a llamarse `paisaje_titulo`: lo que ya estuviera escrito
-- se conserva entero y cae en la línea que manda, que además es la única
-- obligatoria. Renombrar es atómico y no pierde nada; tirar la columna y crear
-- otra al lado se lleva por delante la frase de quien ya la hubiera escrito.
--
--
-- LOS MÍNIMOS BAJAN, Y NO ES UN DESCUIDO.
--
-- La frase entera pedía diez caracteres porque era una oración. Una línea no:
-- «León» son cuatro y es un cierre perfectamente legítimo. Cada una tiene ahora
-- el rango de lo que de verdad cabe en ella — la versalita es corta por
-- definición, el titular es lo que más sitio tiene, el cierre va en medio.
--
-- Rollback: supabase/migrations/rollback/20260914120000_paisaje_tres_lineas.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. La frase pasa a ser el titular, y aparecen sus dos compañeras
-- ---------------------------------------------------------------------------

/*
  Guardado dentro de un `do`: `alter table ... rename column` no admite
  `if exists` sobre la columna, y una migración tiene que poder volver a
  correrse sin reventar. Si ya se renombró, no hay nada que hacer.
*/
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'configuracion_boda'
       and column_name = 'frase_paisaje'
  ) then
    alter table public.configuracion_boda rename column frase_paisaje to paisaje_titulo;
  end if;
end
$$;

alter table public.configuracion_boda
  add column if not exists paisaje_intro text,
  add column if not exists paisaje_cierre text;

comment on column public.configuracion_boda.paisaje_intro is
  'La versalita pequeña que abre la escena del paisaje («Todo empezó entre»). '
  'NULL es «no se ha escrito», y entonces la línea no se pinta: la escena se '
  'sostiene con el titular solo.';

comment on column public.configuracion_boda.paisaje_titulo is
  'El titular de la escena del paisaje («Barcelona y Sevilla»). Es el `h2` de '
  'la sección y la única línea obligatoria: sin él no hay sección, porque una '
  'vista aérea muda es un fondo bonito que no dice nada.';

comment on column public.configuracion_boda.paisaje_cierre is
  'El cierre en cursiva de la escena («y continúa en León»). NULL es «no se ha '
  'escrito»; la escena se sostiene igual.';

-- ---------------------------------------------------------------------------
-- 2. Cuánto cabe en cada línea
-- ---------------------------------------------------------------------------

alter table public.configuracion_boda
  drop constraint if exists configuracion_frase_paisaje_longitud,
  drop constraint if exists configuracion_paisaje_intro_longitud,
  drop constraint if exists configuracion_paisaje_titulo_longitud,
  drop constraint if exists configuracion_paisaje_cierre_longitud;

alter table public.configuracion_boda
  add constraint configuracion_paisaje_intro_longitud
    check (paisaje_intro is null or char_length(btrim(paisaje_intro)) between 2 and 60),
  add constraint configuracion_paisaje_cierre_longitud
    check (paisaje_cierre is null or char_length(btrim(paisaje_cierre)) between 2 and 80);

/*
  El del titular entra `not valid`: hereda lo que hubiera escrito en
  `frase_paisaje`, que se redactó como una oración entera y podía llegar a
  doscientos caracteres. Validar de aquí en adelante sin exigirle nada a lo que
  ya está es exactamente para lo que existe `not valid`.
*/
alter table public.configuracion_boda
  add constraint configuracion_paisaje_titulo_longitud
    check (paisaje_titulo is null or char_length(btrim(paisaje_titulo)) between 2 and 200)
  not valid;

-- ---------------------------------------------------------------------------
-- 3. Que la landing pueda leer las tres
-- ---------------------------------------------------------------------------

/*
  SE TIRA Y SE VUELVE A CREAR, no vale `create or replace`: renombrar la columna
  de la tabla NO renombra la columna de salida de la vista —Postgres la sigue
  publicando como `frase_paisaje`, ahora con un alias— y `create or replace`
  sabe añadir columnas al final pero no cambiarle el nombre a una que ya está.
  Tirarla se lleva sus permisos, así que se vuelven a conceder abajo: sin eso la
  landing se queda sin poder leer su propia configuración.
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

commit;
