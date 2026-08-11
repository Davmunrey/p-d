-- Rollback de 20260811140600_servicios_minimo.sql
--
-- Devuelve la vista a su definición anterior (la de 20260803090600_vistas.sql)
-- antes de quitar las columnas: al revés, el `drop column` fallaría porque la
-- vista las usa.

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
    when s.por_invitado
      then s.precio_unitario * s.cantidad
           * coalesce((select e.confirmados from public.v_estadisticas_invitados as e), 0)
    else s.importe_fijo
  end as importe_total
from public.servicios as s;

create or replace trigger servicios_actualizado_en
  before update on public.servicios
  for each row
  when (
    old.nombre          is distinct from new.nombre or
    old.descripcion     is distinct from new.descripcion or
    old.precio_unitario is distinct from new.precio_unitario or
    old.cantidad        is distinct from new.cantidad or
    old.por_invitado    is distinct from new.por_invitado or
    old.proveedor_id    is distinct from new.proveedor_id
  )
  execute function public.fijar_actualizado_en();

alter table public.servicios drop constraint if exists servicios_base_solo_por_invitado;
alter table public.servicios drop constraint if exists servicios_minimo_solo_por_invitado;
alter table public.servicios drop constraint if exists servicios_minimo_no_negativo;

alter table public.servicios drop column if exists minimo_garantizado;
alter table public.servicios drop column if exists base_calculo;
