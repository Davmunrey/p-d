-- ============================================================================
-- 20260811140200_plantilla_tareas.sql
-- Ticket: BODA-82 (#58) · Tareas iniciales según los meses que faltan
--
-- Qué hace este fichero:
--   1. `plantilla_tareas`: las tareas típicas de organizar una boda, con su
--      antelación respecto a la fecha del enlace. Vive en DATOS y no en
--      código, para poder retocarla sin desplegar.
--   2. `tareas.plantilla_id`: de qué fila de la plantilla salió cada tarea.
--      Es lo que hace idempotente la generación: generar dos veces no
--      duplica nada.
--   3. `generar_tareas_desde_plantilla(grupos)`: crea las tareas de los
--      grupos elegidos calculando su fecha límite desde `configuracion_boda`.
--   4. Un juego inicial de plantilla, sólo si la tabla está vacía.
--
-- POR QUÉ HAY GRUPOS. No todas las bodas llevan lo mismo: ésta es civil, así
-- que el grupo de ceremonia religiosa existe en la plantilla pero no se
-- genera. Se elige por grupo, no tarea a tarea, porque la primera vez nadie
-- sabe todavía cuáles de veinte tareas le tocan — pero sí sabe qué boda tiene.
--
-- Rollback: supabase/migrations/rollback/20260811140200_plantilla_tareas.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. La plantilla
-- ---------------------------------------------------------------------------

create table if not exists public.plantilla_tareas (
  id              uuid not null default gen_random_uuid(),

  titulo          text not null,
  descripcion     text,
  categoria       text,
  prioridad       public.prioridad_tarea not null default 'media',
  -- Cuántos días ANTES de la boda debería estar hecha. La fecha concreta no
  -- vive aquí a propósito: la plantilla sirve para cualquier fecha, y la
  -- fecha real la pone `generar_tareas_desde_plantilla` leyendo la boda.
  antelacion_dias integer not null,
  -- Qué juego de tareas es: 'organizacion', 'ceremonia_civil',
  -- 'ceremonia_religiosa', 'viaje_de_novios'… Es texto y no enum porque
  -- añadir un grupo nuevo debe ser una fila, no una migración.
  grupo           text not null default 'organizacion',
  orden           smallint,

  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  constraint plantilla_tareas_pk primary key (id),

  constraint plantilla_tareas_titulo_longitud
    check (length(btrim(titulo)) between 1 and 160),
  constraint plantilla_tareas_descripcion_longitud
    check (descripcion is null or char_length(descripcion) <= 2000),
  constraint plantilla_tareas_categoria_longitud
    check (categoria is null or length(btrim(categoria)) between 1 and 60),
  constraint plantilla_tareas_antelacion_rango
    check (antelacion_dias between 0 and 1000),
  constraint plantilla_tareas_grupo_longitud
    check (length(btrim(grupo)) between 1 and 60),
  constraint plantilla_tareas_orden_no_negativo
    check (orden is null or orden >= 0)
);
alter table public.plantilla_tareas enable row level security;

comment on table public.plantilla_tareas is
  'Tareas típicas de organizar una boda, con su antelación en días. Nadie '
  'empieza una boda sabiendo que las invitaciones se mandan tres meses antes: '
  'empezar con la lista puesta ahorra los olvidos caros.';
comment on column public.plantilla_tareas.antelacion_dias is
  'Días antes de la boda. La fecha límite concreta la calcula '
  '`generar_tareas_desde_plantilla` contra `configuracion_boda`, nunca una '
  'constante en código.';

-- El mismo truco que el nombre de las mesas: única normalizando, para que
-- «Reservar la finca» y «reservar la finca  » no convivan como dos filas.
create unique index if not exists plantilla_tareas_titulo_unico_idx
  on public.plantilla_tareas (lower(btrim(titulo)));

create or replace trigger plantilla_tareas_actualizado_en
  before update on public.plantilla_tareas
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();

create or replace trigger plantilla_tareas_auditoria
  after insert or update or delete on public.plantilla_tareas
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------------
-- 2. El rastro en `tareas`
-- ---------------------------------------------------------------------------

alter table public.tareas
  add column if not exists plantilla_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tareas_plantilla_id_fk'
  ) then
    alter table public.tareas
      add constraint tareas_plantilla_id_fk
      foreign key (plantilla_id) references public.plantilla_tareas (id)
      on delete set null;
  end if;
end $$;

comment on column public.tareas.plantilla_id is
  'De qué fila de la plantilla salió esta tarea. Es la memoria que hace '
  'idempotente la generación; borrar la fila de plantilla no borra la tarea, '
  'solo el rastro.';

-- Una fila de plantilla genera COMO MUCHO una tarea. El índice es la garantía
-- real; el `not exists` de la función es la cortesía que evita el error.
create unique index if not exists tareas_plantilla_unica_idx
  on public.tareas (plantilla_id)
  where plantilla_id is not null;

-- ---------------------------------------------------------------------------
-- 3. La generación
-- ---------------------------------------------------------------------------
--
-- SECURITY INVOKER a propósito: la función escribe en `tareas` con los
-- permisos de quien llama, así que RLS decide — un lector que la invoque se
-- lleva el mismo 42501 que si intentara el INSERT a mano.

create or replace function public.generar_tareas_desde_plantilla(p_grupos text[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_creadas integer;
begin
  insert into public.tareas (titulo, descripcion, categoria, prioridad, fecha_limite, plantilla_id)
  select
    p.titulo,
    p.descripcion,
    p.categoria,
    p.prioridad,
    -- La fecha de la boda, en su zona horaria, menos la antelación. Contra la
    -- base y nunca contra el reloj del navegador.
    (c.fecha_hora_ceremonia at time zone c.zona_horaria)::date - p.antelacion_dias,
    p.id
  from public.plantilla_tareas as p
  cross join public.configuracion_boda as c
  where p.grupo = any (p_grupos)
    and not exists (
      select 1 from public.tareas as t where t.plantilla_id = p.id
    );

  get diagnostics v_creadas = row_count;
  return v_creadas;
end;
$$;

comment on function public.generar_tareas_desde_plantilla(text[]) is
  'Crea las tareas de los grupos elegidos con su fecha calculada desde la '
  'boda. Idempotente por `plantilla_id`: volver a llamarla no duplica nada, '
  'solo crea lo que falte.';

revoke execute on function public.generar_tareas_desde_plantilla(text[])
  from public, anon, authenticated;
grant execute on function public.generar_tareas_desde_plantilla(text[])
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Privilegios y políticas
-- ---------------------------------------------------------------------------

grant select on public.plantilla_tareas to authenticated;
grant insert, update, delete on public.plantilla_tareas to authenticated;

drop policy if exists plantilla_tareas_leer on public.plantilla_tareas;
create policy plantilla_tareas_leer on public.plantilla_tareas
  for select to authenticated
  using ((select public.puede_leer()));

drop policy if exists plantilla_tareas_escribir on public.plantilla_tareas;
create policy plantilla_tareas_escribir on public.plantilla_tareas
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

-- ---------------------------------------------------------------------------
-- 5. La plantilla con la que empezar
-- ---------------------------------------------------------------------------
--
-- SÓLO SI LA TABLA ESTÁ VACÍA, igual que las categorías de proveedor: quien
-- ya haya empezado a afinar su plantilla no se merece que una migración le
-- meta veinte filas por medio.
--
-- No son una decisión de producto cerrada: se renombran, se reordenan y se
-- borran desde el panel. Las antelaciones son las habituales de una boda que
-- se prepara con un año, no las de ésta en concreto.
--
-- El baile con `force row level security` es el mismo del seed: `force`
-- aplica también a `postgres`, que es quien ejecuta las migraciones, así que
-- se levanta solo durante la carga y se repone justo después. Sin esto, la
-- SEGUNDA aplicación de la migración —que es un escenario real tras un push
-- fallido— reventaría contra la RLS.

alter table public.plantilla_tareas no force row level security;

insert into public.plantilla_tareas (titulo, descripcion, categoria, prioridad, antelacion_dias, grupo, orden)
select * from (values
  ('Cerrar la lista de invitados',        'Sin la cifra no se puede pedir presupuesto en serio a finca ni catering.', 'Invitados',   'alta'::public.prioridad_tarea,   365, 'organizacion', 0),
  ('Reservar la finca',                   'Las fechas buenas vuelan con más de un año.',                              'Lugar',       'urgente'::public.prioridad_tarea, 360, 'organizacion', 1),
  ('Contratar el catering',               'Con prueba de menú antes de firmar.',                                      'Catering',    'alta'::public.prioridad_tarea,   300, 'organizacion', 2),
  ('Contratar fotografía y vídeo',        'Los buenos se reservan con un año.',                                       'Fotografía',  'alta'::public.prioridad_tarea,   300, 'organizacion', 3),
  ('Contratar la música',                 'Ceremonia, cóctel y fiesta: pueden ser tres contratos.',                   'Música',      'media'::public.prioridad_tarea,  240, 'organizacion', 4),
  ('Elegir vestido y traje',              'Los arreglos necesitan meses por delante.',                                'Trajes',      'alta'::public.prioridad_tarea,   240, 'organizacion', 5),
  ('Enviar el save the date',             'En cuanto haya fecha y lugar cerrados.',                                   'Papelería',   'media'::public.prioridad_tarea,  240, 'organizacion', 6),
  ('Bloquear habitaciones de hotel',      'Un cupo con precio pactado para los de fuera.',                            'Alojamiento', 'media'::public.prioridad_tarea,  180, 'organizacion', 7),
  ('Contratar las flores',                'Ramo, decoración de ceremonia y centros de mesa.',                         'Flores',      'media'::public.prioridad_tarea,  150, 'organizacion', 8),
  ('Enviar las invitaciones',             'Con el enlace de confirmación de cada grupo.',                             'Papelería',   'alta'::public.prioridad_tarea,   100, 'organizacion', 9),
  ('Prueba de menú',                      'Y cerrar los menús especiales: infantil, vegetariano, alergias.',          'Catering',    'media'::public.prioridad_tarea,   90, 'organizacion', 10),
  ('Contratar el transporte de invitados','Autobuses según lo que diga el RSVP.',                                     'Transporte',  'media'::public.prioridad_tarea,   75, 'organizacion', 11),
  ('Prueba de peluquería y maquillaje',   'Con la antelación justa para poder rectificar.',                           'Belleza',     'media'::public.prioridad_tarea,   45, 'organizacion', 12),
  ('Encargar la tarta',                   'El catering suele necesitarlo un mes antes.',                              'Catering',    'baja'::public.prioridad_tarea,    30, 'organizacion', 13),
  ('Recoger los anillos',                 'Con margen para grabarlos y ajustarlos.',                                  'Otros',       'media'::public.prioridad_tarea,   30, 'organizacion', 14),
  ('Cerrar el plan de mesas',             'Con las confirmaciones ya recibidas.',                                     'Invitados',   'alta'::public.prioridad_tarea,    21, 'organizacion', 15),
  ('Confirmar el recuento al catering',   'La cifra final por tipo de menú, niños aparte.',                           'Catering',    'urgente'::public.prioridad_tarea,   7, 'organizacion', 16),
  ('Iniciar el expediente matrimonial',   'En el Registro Civil o en notaría. Tarda meses: es lo primero.',           'Papeleo',     'urgente'::public.prioridad_tarea, 240, 'ceremonia_civil', 17),
  ('Reunir los certificados del expediente', 'Nacimiento y empadronamiento caducan: pedirlos con el expediente ya en marcha.', 'Papeleo', 'alta'::public.prioridad_tarea, 210, 'ceremonia_civil', 18),
  ('Designar a los testigos',             'El expediente los pide con su DNI.',                                       'Papeleo',     'media'::public.prioridad_tarea,  180, 'ceremonia_civil', 19),
  ('Confirmar fecha y sala del juzgado',  'La cita de la ceremonia civil no la elige la finca.',                      'Papeleo',     'alta'::public.prioridad_tarea,   120, 'ceremonia_civil', 20),
  ('Apuntarse al cursillo prematrimonial','Lo exige la diócesis y las plazas se acaban.',                             'Papeleo',     'alta'::public.prioridad_tarea,   270, 'ceremonia_religiosa', 21),
  ('Abrir el expediente canónico',        'En la parroquia de uno de los dos.',                                       'Papeleo',     'alta'::public.prioridad_tarea,   180, 'ceremonia_religiosa', 22),
  ('Reservar el viaje de novios',         'Vuelos y hoteles, antes de que suban.',                                    'Viaje',       'media'::public.prioridad_tarea,  150, 'viaje_de_novios', 23),
  ('Revisar pasaportes y visados',        'Renovar un pasaporte caducado lleva semanas.',                             'Viaje',       'media'::public.prioridad_tarea,   90, 'viaje_de_novios', 24)
) as iniciales (titulo, descripcion, categoria, prioridad, antelacion_dias, grupo, orden)
where not exists (select 1 from public.plantilla_tareas);

alter table public.plantilla_tareas force row level security;

commit;
