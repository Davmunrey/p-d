-- ============================================================================
-- 20260811140300_guion_dia.sql
-- Ticket: BODA-100 (#67) · Lista de control del día
--
-- Qué hace este fichero:
--   1. `guion_dia`: el guion de la jornada, punto a punto, con su hora, su
--      responsable y su marca de hecho.
--   2. Sus privilegios y sus políticas RLS.
--
-- POR QUÉ NO ES `hitos_programa`. Aquello es contenido de la landing: lo que
-- ven los invitados («14:00 · Banquete»). Esto es operación interna: «13:15 ·
-- confirmar que el autobús ha salido · Marta». Mezclarlos obligaría a filtrar
-- lo privado en cada lectura pública, y un despiste publicaría el teléfono
-- del conductor en la web.
--
-- POR QUÉ NO ES `tareas`. Una tarea tiene fecha límite y se planifica; un
-- punto del guion tiene HORA y se ejecuta. El día de la boda no se mira un
-- kanban: se mira qué toca ahora.
--
-- La hora es texto y no `time` por el mismo motivo que en `hitos_programa`:
-- en una boda se escribe «13:15» pero también «al acabar el cóctel».
--
-- Rollback: supabase/migrations/rollback/20260811140300_guion_dia.sql
-- ============================================================================

begin;

create table if not exists public.guion_dia (
  id             uuid not null default gen_random_uuid(),

  hora           text not null,
  titulo         text not null,
  -- Quién se encarga. Texto libre y no una clave a `perfiles`: el responsable
  -- de que el autobús salga es «el hermano de la novia» o «Rocío, la
  -- coordinadora de la finca», gente que jamás tendrá cuenta en el panel.
  responsable    text,
  notas          text,
  orden          smallint not null default 0,
  -- Cuándo se marcó como hecho. La marca es una fecha y no un booleano:
  -- «hecho a las 13:22» reconstruye la jornada; «hecho» a secas, no.
  hecho_en       timestamptz,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint guion_dia_pk primary key (id),

  constraint guion_dia_hora_longitud
    check (length(btrim(hora)) between 1 and 40),
  constraint guion_dia_titulo_longitud
    check (length(btrim(titulo)) between 1 and 160),
  constraint guion_dia_responsable_longitud
    check (responsable is null or char_length(responsable) <= 120),
  constraint guion_dia_notas_longitud
    check (notas is null or char_length(notas) <= 1000),
  constraint guion_dia_orden_no_negativo
    check (orden >= 0)
);
alter table public.guion_dia enable row level security;

comment on table public.guion_dia is
  'El guion de la jornada de la boda: qué pasa, a qué hora y quién responde '
  'de ello. Se ejecuta desde el móvil, de pie y con prisa; el orden lo manda '
  '`orden` y no la hora, porque la hora puede ser «al acabar el cóctel».';
comment on column public.guion_dia.hecho_en is
  'La marca de hecho, con hora. NULL es pendiente. Se marca y se desmarca '
  'desde el móvil el mismo día, así que el toque tiene que ser reversible.';

create index if not exists guion_dia_orden_idx
  on public.guion_dia (orden, hora);

create or replace trigger guion_dia_actualizado_en
  before update on public.guion_dia
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();

create or replace trigger guion_dia_auditoria
  after insert or update or delete on public.guion_dia
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------------
-- Privilegios y políticas
-- ---------------------------------------------------------------------------

grant select on public.guion_dia to authenticated;
grant insert, update, delete on public.guion_dia to authenticated;

drop policy if exists guion_dia_leer on public.guion_dia;
create policy guion_dia_leer on public.guion_dia
  for select to authenticated
  using ((select public.puede_leer()));

drop policy if exists guion_dia_escribir on public.guion_dia;
create policy guion_dia_escribir on public.guion_dia
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

alter table public.guion_dia force row level security;

commit;
