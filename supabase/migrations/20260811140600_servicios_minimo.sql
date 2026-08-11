-- ============================================================================
-- 20260811140600_servicios_minimo.sql
-- Ticket: BODA-74 (#55) · Servicios con precio por invitado
--
-- Qué hace este fichero:
--   1. `servicios.base_calculo`: a quién multiplica un servicio por invitado.
--   2. `servicios.minimo_garantizado`: lo que se paga aunque falte gente.
--   3. Redefine `v_servicios_importe` para que la base —y solo la base—
--      resuelva la cuenta: confirmados según la base de cálculo, y nunca por
--      debajo del mínimo del contrato.
--
-- EL MÍNIMO GARANTIZADO ES DEL CONTRATO, NO UN DESEO. El catering firma «120
-- cubiertos mínimo»: si confirman 95, se pagan 120. Guardarlo aquí y aplicar
-- el `greatest` en la vista hace que el panel entero enseñe la cifra que se
-- va a pagar de verdad, no la que saldría de contar confirmados.
--
-- Rollback: supabase/migrations/rollback/20260811140600_servicios_minimo.sql
-- ============================================================================

begin;

alter table public.servicios
  add column if not exists base_calculo public.base_servicio not null default 'todos';

alter table public.servicios
  add column if not exists minimo_garantizado numeric(12, 2);

comment on column public.servicios.base_calculo is
  'A quién multiplica un servicio por invitado: todos, adultos o niños. El '
  'menú infantil se modela como OTRO servicio con base `ninos` y su tarifa, '
  'no como un descuento del de adultos.';
comment on column public.servicios.minimo_garantizado is
  'El mínimo del contrato: lo que se paga aunque falte gente. NULL es «sin '
  'mínimo pactado». Solo tiene sentido en servicios por invitado; en los de '
  'precio cerrado el importe fijo ya es el compromiso.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'servicios_minimo_no_negativo'
  ) then
    alter table public.servicios
      add constraint servicios_minimo_no_negativo
      check (minimo_garantizado is null or minimo_garantizado >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'servicios_minimo_solo_por_invitado'
  ) then
    alter table public.servicios
      add constraint servicios_minimo_solo_por_invitado
      check (minimo_garantizado is null or por_invitado);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'servicios_base_solo_por_invitado'
  ) then
    -- Un servicio de precio cerrado con base «niños» sería un dato que parece
    -- decir algo y no dice nada. Se fuerza el valor neutro.
    alter table public.servicios
      add constraint servicios_base_solo_por_invitado
      check (por_invitado or base_calculo = 'todos');
  end if;
end $$;

-- El sello de `actualizado_en` de `servicios` enumera columnas en vez de usar
-- `old.* is distinct from new.*` (imposible con una columna generada), así
-- que las dos nuevas hay que añadirlas o editarlas no dejaría rastro.
create or replace trigger servicios_actualizado_en
  before update on public.servicios
  for each row
  when (
    old.nombre             is distinct from new.nombre or
    old.descripcion        is distinct from new.descripcion or
    old.precio_unitario    is distinct from new.precio_unitario or
    old.cantidad           is distinct from new.cantidad or
    old.por_invitado       is distinct from new.por_invitado or
    old.proveedor_id       is distinct from new.proveedor_id or
    old.base_calculo       is distinct from new.base_calculo or
    old.minimo_garantizado is distinct from new.minimo_garantizado
  )
  execute function public.fijar_actualizado_en();

-- ---------------------------------------------------------------------------
-- La cuenta, en la vista y en ningún otro sitio
-- ---------------------------------------------------------------------------
--
-- `create or replace` conserva los grants; las columnas nuevas van al final,
-- que es lo único que `replace` permite. `importe_calculado` es la cuenta sin
-- el mínimo: la diferencia entre ambos es exactamente lo que la pantalla
-- tiene que poder explicar («hoy saldría por X, el contrato garantiza Y»).

create or replace view public.v_servicios_importe
with (security_invoker = on) as
select
  s.id,
  s.proveedor_id,
  s.nombre,
  s.descripcion,
  s.precio_unitario,
  s.cantidad,
  s.por_invitado,
  s.importe_fijo,
  case
    when s.por_invitado then greatest(
      s.precio_unitario * s.cantidad
        * coalesce((
            select case s.base_calculo
              when 'adultos' then e.adultos_confirmados
              when 'ninos'   then e.ninos_confirmados
              else                e.confirmados
            end
            from public.v_estadisticas_invitados as e
          ), 0),
      coalesce(s.minimo_garantizado, 0)
    )
    else s.importe_fijo
  end as importe_total,
  s.base_calculo,
  s.minimo_garantizado,
  case
    when s.por_invitado then
      s.precio_unitario * s.cantidad
        * coalesce((
            select case s.base_calculo
              when 'adultos' then e.adultos_confirmados
              when 'ninos'   then e.ninos_confirmados
              else                e.confirmados
            end
            from public.v_estadisticas_invitados as e
          ), 0)
    else s.importe_fijo
  end as importe_calculado
from public.servicios as s;

comment on view public.v_servicios_importe is
  'Importe real de cada servicio, resolviendo aquí —y no en el frontend— los '
  'de precio por invitado: confirmados según `base_calculo`, y nunca por '
  'debajo de `minimo_garantizado`. `importe_calculado` es la cuenta sin el '
  'mínimo, para poder enseñar la diferencia. Confirmar un invitado recalcula '
  'todo esto solo, porque no hay nada que recalcular: es una vista.';

commit;
