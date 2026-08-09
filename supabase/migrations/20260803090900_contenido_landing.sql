-- BODA-11 · Contenido editable de la landing
--
-- El enumerado `seccion_landing` ya contemplaba estas secciones, pero no
-- existía dónde guardar su contenido: el programa del día, los alojamientos,
-- las rutas para llegar, las preguntas frecuentes, los hitos de la historia y
-- las canciones que sugieren los invitados.
--
-- Sin estas tablas la landing tendría que llevar los datos incrustados, que es
-- exactamente lo que prohíbe la regla 1. Todo lo que se ve en la web se edita
-- desde el panel.
--
-- LECTURA PÚBLICA, ESCRITURA CERRADA
--
-- Estas tablas son la excepción deliberada al «anon no lee nada»: su contenido
-- ES la web pública. Aun así se filtra por `publicado`, de modo que se puede
-- preparar una sección sin que se vea todavía. Escribir sigue siendo cosa de
-- editores.
--
-- La playlist es el único sitio donde un invitado escribe sin estar
-- autenticado. No se abre la tabla a `anon`: se hace por una función que exige
-- el token de invitación, igual que el RSVP. Una web abierta a internet con
-- INSERT libre acaba llena de spam.

-- ---------------------------------------------------------------------------
-- 1. Programa del día
-- ---------------------------------------------------------------------------

create table if not exists public.hitos_programa (
  id             uuid primary key default extensions.gen_random_uuid(),
  hora           text        not null,
  titulo         text        not null,
  descripcion    text,
  orden          smallint    not null default 0,
  publicado      boolean     not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint hitos_programa_hora_no_vacia check (btrim(hora) <> ''),
  constraint hitos_programa_titulo_no_vacio check (btrim(titulo) <> '')
);

comment on table public.hitos_programa is
  'El día hora a hora. La hora es texto y no `time` a propósito: en una boda se '
  'escribe «14:00», «sobre las 19:30» o «de madrugada», y forzar un tipo horario '
  'obligaría a inventar convenciones para lo aproximado.';

-- ---------------------------------------------------------------------------
-- 2. Alojamientos recomendados
-- ---------------------------------------------------------------------------

create table if not exists public.alojamientos (
  id             uuid primary key default extensions.gen_random_uuid(),
  nombre         text        not null,
  distintivo     text,
  descripcion    text,
  precio_texto   text,
  url_reserva    text,
  medio_id       uuid references public.medios (id) on delete set null,
  orden          smallint    not null default 0,
  publicado      boolean     not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint alojamientos_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint alojamientos_url_valida
    check (url_reserva is null or url_reserva ~* '^https?://')
);

comment on column public.alojamientos.precio_texto is
  'Texto libre, no numérico: las tarifas de hotel se comunican como «135 € / '
  'noche» o «desde 90 €», y un numeric obligaría a decidir impuestos y régimen.';

-- ---------------------------------------------------------------------------
-- 3. Cómo llegar
-- ---------------------------------------------------------------------------

create table if not exists public.rutas_llegada (
  id             uuid primary key default extensions.gen_random_uuid(),
  modo           text        not null,
  duracion       text,
  detalle        text,
  orden          smallint    not null default 0,
  publicado      boolean     not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint rutas_llegada_modo_no_vacio check (btrim(modo) <> '')
);

-- ---------------------------------------------------------------------------
-- 4. Preguntas frecuentes
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 5. Nuestra historia
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 6. Playlist colaborativa
-- ---------------------------------------------------------------------------

create table if not exists public.canciones_sugeridas (
  id             uuid primary key default extensions.gen_random_uuid(),
  texto          text        not null,
  grupo_id       uuid references public.grupos_invitacion (id) on delete set null,
  aprobada       boolean     not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint canciones_texto_no_vacio check (btrim(texto) <> ''),
  constraint canciones_texto_razonable check (length(texto) between 2 and 160)
);

comment on table public.canciones_sugeridas is
  'Sugerencias de los invitados. `grupo_id` queda como rastro por si hay que '
  'retirar algo; se pone a null si el grupo desaparece, para no perder la '
  'canción. `aprobada` permite ocultar una sugerencia sin borrarla.';

-- ---------------------------------------------------------------------------
-- 7. Marcas temporales
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'hitos_programa', 'alojamientos', 'rutas_llegada',
    'preguntas_frecuentes', 'hitos_historia', 'canciones_sugeridas'
  ] loop
    execute format(
      'create or replace trigger trg_%1$s_actualizado_en
         before update on public.%1$I
         for each row when (old.* is distinct from new.*)
         execute function public.fijar_actualizado_en()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Índices
-- ---------------------------------------------------------------------------

create index if not exists idx_hitos_programa_orden
  on public.hitos_programa (orden) where publicado;
create index if not exists idx_alojamientos_orden
  on public.alojamientos (orden) where publicado;
create index if not exists idx_rutas_llegada_orden
  on public.rutas_llegada (orden) where publicado;
create index if not exists idx_preguntas_frecuentes_orden
  on public.preguntas_frecuentes (orden) where publicado;
create index if not exists idx_hitos_historia_orden
  on public.hitos_historia (orden) where publicado;
create index if not exists idx_canciones_creado_en
  on public.canciones_sugeridas (creado_en desc) where aprobada;
create index if not exists idx_alojamientos_medio on public.alojamientos (medio_id);
create index if not exists idx_hitos_historia_medio on public.hitos_historia (medio_id);
create index if not exists idx_canciones_grupo on public.canciones_sugeridas (grupo_id);

-- ---------------------------------------------------------------------------
-- 9. Seguridad
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'hitos_programa', 'alojamientos', 'rutas_llegada',
    'preguntas_frecuentes', 'hitos_historia', 'canciones_sugeridas'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    -- Se cierra todo y se abre sólo lo justo. El default de Supabase concede
    -- de más sobre cualquier tabla nueva.
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Lectura pública: sólo lo publicado. Esta es la excepción consciente al
-- «anon no lee nada», porque este contenido ES la web pública.
create policy hitos_programa_lectura_publica on public.hitos_programa
  for select to anon, authenticated using (publicado);
create policy alojamientos_lectura_publica on public.alojamientos
  for select to anon, authenticated using (publicado);
create policy rutas_llegada_lectura_publica on public.rutas_llegada
  for select to anon, authenticated using (publicado);
create policy preguntas_frecuentes_lectura_publica on public.preguntas_frecuentes
  for select to anon, authenticated using (publicado);
create policy hitos_historia_lectura_publica on public.hitos_historia
  for select to anon, authenticated using (publicado);
create policy canciones_lectura_publica on public.canciones_sugeridas
  for select to anon, authenticated using (aprobada);

-- Escritura: sólo editores, y con `with check` para que no se pueda mover una
-- fila fuera del alcance permitido.
do $$
declare
  t text;
begin
  foreach t in array array[
    'hitos_programa', 'alojamientos', 'rutas_llegada',
    'preguntas_frecuentes', 'hitos_historia', 'canciones_sugeridas'
  ] loop
    execute format(
      'create policy %1$s_gestion on public.%1$I
         for all to authenticated
         using ((select public.puede_editar()))
         with check ((select public.puede_editar()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Sugerir canción: la única escritura pública, y sólo con token
-- ---------------------------------------------------------------------------

create or replace function public.sugerir_cancion(p_token text, p_texto text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_grupo_id uuid;
  v_texto    text := btrim(coalesce(p_texto, ''));
  v_id       uuid;
  v_cuantas  integer;
begin
  perform public.exigir_cupo_rsvp();

  if length(v_texto) < 2 or length(v_texto) > 160 then
    raise exception 'CAN01'
      using errcode = 'check_violation',
            hint    = 'Escribid la canción y el artista, sin pasaros de largo.';
  end if;

  select g.id into v_grupo_id
    from public.grupos_invitacion as g
   where g.huella_token = public.huella_token(p_token);

  -- Sin token válido no se escribe. La playlist es de los invitados, no de
  -- internet entera.
  if v_grupo_id is null then
    perform public.registrar_intento_rsvp(p_token, false);
    raise exception 'CAN02'
      using errcode = 'insufficient_privilege',
            hint    = 'Ese enlace no es válido.';
  end if;

  -- Tope por grupo: evita que una familia llene la lista ella sola, por
  -- entusiasmo o por accidente con el botón.
  select count(*) into v_cuantas
    from public.canciones_sugeridas as c
   where c.grupo_id = v_grupo_id;

  if v_cuantas >= 10 then
    raise exception 'CAN03'
      using errcode = 'check_violation',
            hint    = 'Ya habéis sugerido diez canciones. Con eso hay fiesta de sobra.';
  end if;

  insert into public.canciones_sugeridas (texto, grupo_id)
  values (v_texto, v_grupo_id)
  returning id into v_id;

  return v_id;
end;
$function$;

comment on function public.sugerir_cancion(text, text) is
  'Añade una canción a la playlist. Exige token de invitación válido y limita a '
  'diez por grupo.';

revoke all on function public.sugerir_cancion(text, text) from public;
grant execute on function public.sugerir_cancion(text, text) to anon, authenticated;
