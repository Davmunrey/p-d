-- ============================================================================
-- 20260811140400_correcciones_recuento.sql
-- Ticket: BODA-103 (#70) · Recuento en vivo para el catering
--
-- Qué hace este fichero:
--   1. `correcciones_recuento`: el ajuste de última hora, por tipo de menú,
--      SIN tocar la confirmación del invitado.
--   2. `v_recuento_catering`: la cifra que se le dice al catering, calculada
--      por la base — confirmados por menú más su corrección.
--   3. `v_alergias_por_mesa`: las alergias agrupadas por mesa, que es como
--      las necesita la cocina.
--
-- POR QUÉ UNA TABLA APARTE. El primo que avisa a las diez de que no llega no
-- ha «rechazado»: su confirmación es historia real y el histórico de
-- `confirmaciones` es inmutable a propósito. Lo que cambia es la cifra que se
-- le dice al catering, y eso es una corrección con su nota — «Jorge no llega,
-- avisó por teléfono» — no una reescritura del RSVP.
--
-- Rollback: supabase/migrations/rollback/20260811140400_correcciones_recuento.sql
-- ============================================================================

begin;

create table if not exists public.correcciones_recuento (
  id             uuid not null default gen_random_uuid(),

  tipo_menu      public.tipo_menu not null,
  -- Cuántos cubiertos arriba o abajo respecto a lo confirmado. Puede ser
  -- negativo: es justo el caso que justifica la tabla.
  ajuste         integer not null default 0,
  nota           text,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint correcciones_recuento_pk primary key (id),

  -- Una corrección por menú. Dos filas del mismo menú serían dos verdades, y
  -- la víspera de la boda nadie tiene tiempo de sumarlas.
  constraint correcciones_recuento_menu_unico unique (tipo_menu),

  constraint correcciones_recuento_ajuste_rango
    check (ajuste between -500 and 500),
  constraint correcciones_recuento_nota_longitud
    check (nota is null or char_length(nota) <= 500)
);
alter table public.correcciones_recuento enable row level security;

comment on table public.correcciones_recuento is
  'Ajustes de última hora al recuento del catering, por tipo de menú. No toca '
  'las confirmaciones: corrige la cifra que se dice por teléfono, no lo que '
  'respondió el invitado.';

create or replace trigger correcciones_recuento_actualizado_en
  before update on public.correcciones_recuento
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();

create or replace trigger correcciones_recuento_auditoria
  after insert or update or delete on public.correcciones_recuento
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------------
-- 2. La cifra del catering, calculada por la base
-- ---------------------------------------------------------------------------
--
-- El total lo suma la base y nunca el navegador, como todos los totales del
-- proyecto. `full join`: puede haber una corrección de un menú del que aún no
-- hay confirmados (los dos niños que vienen sin haber contestado), y menús
-- confirmados sin corrección, y ninguno de los dos puede desaparecer.

create or replace view public.v_recuento_catering
with (security_invoker = on) as
select
  coalesce(m.tipo_menu, c.tipo_menu)             as tipo_menu,
  coalesce(m.personas, 0)                        as confirmados,
  coalesce(m.con_alergias, 0)                    as con_alergias,
  coalesce(c.ajuste, 0)                          as ajuste,
  coalesce(m.personas, 0) + coalesce(c.ajuste, 0) as total,
  c.nota,
  c.actualizado_en                               as corregido_en
from public.v_menus_confirmados as m
full join public.correcciones_recuento as c
  on c.tipo_menu = m.tipo_menu;

comment on view public.v_recuento_catering is
  'La cifra que pide el catering la víspera: confirmados por menú más la '
  'corrección de última hora. Es la única definición de ese total en el '
  'proyecto; la pantalla la enseña, no la recalcula.';

-- ---------------------------------------------------------------------------
-- 3. Las alergias como las pide la cocina: por mesa
-- ---------------------------------------------------------------------------

create or replace view public.v_alergias_por_mesa
with (security_invoker = on) as
select
  me.nombre     as mesa,
  me.id         as mesa_id,
  i.nombre,
  i.apellidos,
  i.tipo_menu,
  i.es_nino,
  i.alergias
from public.invitados as i
join public.confirmaciones as f
  on f.invitado_id = i.id and f.es_vigente
left join public.mesas as me
  on me.id = i.mesa_id
where f.estado = 'confirmado'
  and i.alergias is not null
order by me.nombre nulls last, i.apellidos, i.nombre;

comment on view public.v_alergias_por_mesa is
  'Quién lleva alergias y en qué mesa se sienta. El `left join` es a '
  'propósito: una alergia sin mesa asignada es justo la que no puede '
  'perderse de la lista.';

-- ---------------------------------------------------------------------------
-- 4. Privilegios y políticas
-- ---------------------------------------------------------------------------

grant select on public.correcciones_recuento to authenticated;
grant insert, update, delete on public.correcciones_recuento to authenticated;
grant select on public.v_recuento_catering to authenticated;
grant select on public.v_alergias_por_mesa to authenticated;

drop policy if exists correcciones_recuento_leer on public.correcciones_recuento;
create policy correcciones_recuento_leer on public.correcciones_recuento
  for select to authenticated
  using ((select public.puede_leer()));

drop policy if exists correcciones_recuento_escribir on public.correcciones_recuento;
create policy correcciones_recuento_escribir on public.correcciones_recuento
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

alter table public.correcciones_recuento force row level security;

commit;
