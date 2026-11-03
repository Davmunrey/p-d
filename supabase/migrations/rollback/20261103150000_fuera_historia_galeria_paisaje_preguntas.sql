-- Rollback de 20261103150000_fuera_historia_galeria_paisaje_preguntas.sql
--
-- Vuelven las dos tablas —vacías: lo que hubiera se borró con ellas—, las tres
-- columnas del paisaje con sus topes y su sitio en la vista, las filas de las
-- cinco secciones (encendidas, en su orden de siempre) y se quitan los CHECK
-- que las vetaban.
begin;

alter table public.secciones_landing
  drop constraint if exists secciones_landing_seccion_vigente;
alter table public.medios
  drop constraint if exists medios_seccion_vigente;

insert into public.secciones_landing (seccion, visible, orden) values
  ('paisaje', true, 5),
  ('historia', true, 20),
  ('galeria', true, 36),
  ('ubicaciones', true, 40),
  ('preguntas_frecuentes', true, 70)
on conflict (seccion) do nothing;

-- Las tablas, como las dejó 20260803090900_contenido_landing.sql.
create table if not exists public.preguntas_frecuentes (
  id             uuid primary key default extensions.gen_random_uuid(),
  pregunta       text        not null,
  respuesta      text        not null,
  orden          smallint    not null default 0,
  publicado      boolean     not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint preguntas_frecuentes_pregunta_no_vacia check (btrim(pregunta) <> ''),
  constraint preguntas_frecuentes_respuesta_no_vacia check (btrim(respuesta) <> '')
);

create table if not exists public.hitos_historia (
  id             uuid primary key default extensions.gen_random_uuid(),
  titulo         text        not null,
  fecha_texto    text,
  descripcion    text,
  medio_id       uuid references public.medios (id) on delete set null,
  orden          smallint    not null default 0,
  publicado      boolean     not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint hitos_historia_titulo_no_vacio check (btrim(titulo) <> '')
);


create index if not exists idx_preguntas_frecuentes_orden
  on public.preguntas_frecuentes (orden) where publicado;
create index if not exists idx_hitos_historia_orden
  on public.hitos_historia (orden) where publicado;
create index if not exists idx_hitos_historia_medio on public.hitos_historia (medio_id);

do $$
declare
  t text;
begin
  foreach t in array array['preguntas_frecuentes', 'hitos_historia'] loop
    execute format(
      'create or replace trigger trg_%1$s_actualizado_en
         before update on public.%1$I
         for each row when (old.* is distinct from new.*)
         execute function public.fijar_actualizado_en()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy %1$s_gestion on public.%1$I
         for all to authenticated
         using ((select public.puede_editar()))
         with check ((select public.puede_editar()))', t);
  end loop;
end $$;

create policy preguntas_frecuentes_lectura_publica on public.preguntas_frecuentes
  for select to anon, authenticated using (publicado);
create policy hitos_historia_lectura_publica on public.hitos_historia
  for select to anon, authenticated using (publicado);

-- El paisaje: las columnas, sus topes y su sitio en la vista.
alter table public.configuracion_boda
  add column if not exists paisaje_intro text,
  add column if not exists paisaje_titulo text,
  add column if not exists paisaje_cierre text;

alter table public.configuracion_boda
  add constraint configuracion_paisaje_intro_longitud
    check (paisaje_intro is null or char_length(btrim(paisaje_intro)) between 2 and 60),
  add constraint configuracion_paisaje_titulo_longitud
    check (paisaje_titulo is null or char_length(btrim(paisaje_titulo)) between 2 and 200),
  add constraint configuracion_paisaje_cierre_longitud
    check (paisaje_cierre is null or char_length(btrim(paisaje_cierre)) between 2 and 80);

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
  c.avisos_programa,
  c.firma_regalos,
  c.lugar_preboda
from public.configuracion_boda as c;


comment on view public.v_configuracion_publica is
  'Lo que la landing necesita para pintarse. Las columnas van enumeradas aunque '
  '`configuracion_boda` sea publicable entera: es la disciplina que impide que '
  'una columna añadida mañana aparezca sola en la web.';

grant select on public.v_configuracion_publica to anon, authenticated;

commit;
