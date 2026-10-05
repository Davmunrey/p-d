-- Reverso de 20261005120000_gasto_no_baja_de_sus_pagos.sql
--
-- Quita el trigger del gasto y devuelve el de los pagos a como lo dejó
-- 20260810233000_pagos_calendario.sql: comprobando siempre y sin bloquear la
-- fila del gasto.

begin;

drop trigger if exists partidas_por_encima_de_sus_pagos on public.partidas_presupuesto;
drop function if exists public.exigir_gasto_por_encima_de_sus_pagos();

create or replace function public.exigir_pago_dentro_del_gasto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tope     numeric(12, 2);
  v_apuntado numeric(12, 2);
begin
  select coalesce(p.importe_real, p.importe_estimado)
    into v_tope
    from public.partidas_presupuesto as p
   where p.id = new.partida_id;

  if coalesce(v_tope, 0) <= 0 then
    return new;
  end if;

  -- `is distinct from` y no `<>`: al INSERTAR no hay fila previa que excluir y
  -- `new.id <> pg.id` con un id nuevo funcionaría igual, pero al ACTUALIZAR el
  -- importe hay que dejar fuera el pago que se está cambiando o se sumaría dos
  -- veces contra sí mismo.
  select coalesce(sum(pg.importe), 0)
    into v_apuntado
    from public.pagos as pg
   where pg.partida_id = new.partida_id
     and pg.id is distinct from new.id;

  if v_apuntado + new.importe > v_tope then
    raise exception 'PAG01'
      using errcode = 'check_violation',
            detail  = format(
              'gasto=%s tope=%s apuntado=%s intento=%s',
              new.partida_id, v_tope, v_apuntado, new.importe
            ),
            hint    = 'El pago no cabe en el gasto. Subid antes el importe del gasto.';
  end if;

  return new;
end;
$$;

commit;
