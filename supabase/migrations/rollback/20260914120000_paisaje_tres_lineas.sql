-- ============================================================================
-- ROLLBACK de 20260914120000_paisaje_tres_lineas.sql
-- Ticket: BODA-117 (#146)
--
-- Vuelve a dejar la frase del paisaje en un solo campo, `frase_paisaje`.
--
-- LA FRASE SE RECOMPONE, NO SE PIERDE. Antes de renombrar, las tres líneas se
-- vuelven a juntar con un espacio en medio: quien hubiera escrito «Todo empezó
-- entre» / «Barcelona y Sevilla» / «y continúa en León» recupera la oración
-- entera, que es justo lo que el campo único guardaba. `concat_ws` se salta las
-- nulas solo, así que una escena a medias también vuelve bien.
--
-- El resultado puede pasarse de los doscientos caracteres que pedía la
-- restricción antigua; por eso vuelve a entrar `not valid`, igual que entró la
-- primera vez, y exige el tamaño sólo a lo que se escriba a partir de ahora.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. La vista se aparta primero
-- ---------------------------------------------------------------------------

/*
  LA VISTA SE TIRA ANTES DE TOCAR LAS COLUMNAS, y el orden no es cosmético:
  `v_configuracion_publica` enumera `paisaje_intro` y `paisaje_cierre`, así que
  con la vista en pie Postgres se niega a soltarlas —«cannot drop column ...
  because other objects depend on it»— y el rollback muere a mitad. Se aparta
  aquí y se vuelve a levantar abajo, ya con la frase recompuesta.
*/
drop view if exists public.v_configuracion_publica;

-- ---------------------------------------------------------------------------
-- 2. Las tres líneas vuelven a ser una frase
-- ---------------------------------------------------------------------------

update public.configuracion_boda
   set paisaje_titulo = nullif(
         btrim(concat_ws(' ', btrim(paisaje_intro), btrim(paisaje_titulo), btrim(paisaje_cierre))),
         ''
       )
 where paisaje_intro is not null
    or paisaje_cierre is not null;

alter table public.configuracion_boda
  drop constraint if exists configuracion_paisaje_intro_longitud,
  drop constraint if exists configuracion_paisaje_titulo_longitud,
  drop constraint if exists configuracion_paisaje_cierre_longitud;

alter table public.configuracion_boda
  drop column if exists paisaje_intro,
  drop column if exists paisaje_cierre;

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'configuracion_boda'
       and column_name = 'paisaje_titulo'
  ) then
    alter table public.configuracion_boda rename column paisaje_titulo to frase_paisaje;
  end if;
end
$$;

alter table public.configuracion_boda
  drop constraint if exists configuracion_frase_paisaje_longitud;

alter table public.configuracion_boda
  add constraint configuracion_frase_paisaje_longitud
    check (
      frase_paisaje is null
      or char_length(btrim(frase_paisaje)) between 10 and 200
    )
  not valid;

comment on column public.configuracion_boda.frase_paisaje is
  'La frase de la sección de paisaje, bajo la portada. NULL es «todavía no se ha '
  'escrito», y entonces la sección no se pinta: es el mismo criterio que el '
  'resto de la landing, antes ocultar que dejar un hueco.';

-- ---------------------------------------------------------------------------
-- 3. La vista vuelve a publicar la frase
-- ---------------------------------------------------------------------------

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
  c.frase_paisaje,
  c.ciudad_ceremonia,
  c.avisos_programa
from public.configuracion_boda as c;

comment on view public.v_configuracion_publica is
  'Lo que la landing necesita para pintarse. Las columnas van enumeradas aunque '
  '`configuracion_boda` sea publicable entera: es la disciplina que impide que '
  'una columna añadida mañana aparezca sola en la web.';

grant select on public.v_configuracion_publica to anon, authenticated;

commit;
