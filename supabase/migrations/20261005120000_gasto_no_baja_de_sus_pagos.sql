-- ============================================================================
-- 20261005120000_gasto_no_baja_de_sus_pagos.sql
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero: que la regla «los pagos de un gasto no pasan de su
-- importe» se cumpla también desde el lado del gasto.
--
--
-- EL FALLO.
--
-- `pagos_dentro_del_gasto` sólo miraba al escribir un PAGO. Bajar el importe
-- de un GASTO por debajo de lo ya apuntado se aceptaba sin aviso —un catering
-- con 8 600 € en pagos podía quedarse en 8 000—, y a partir de ahí ningún pago
-- de ese gasto se podía editar, ni siquiera para cambiar la fecha: el trigger
-- salta en cuanto `importe` está en el SET, aunque no cambie, y la suma ya no
-- cabía.
--
--
-- EL ARREGLO.
--
-- 1. `partidas_por_encima_de_sus_pagos`: al BAJAR el importe de un gasto, si
--    queda por debajo de la suma de sus pagos, PAR01. Subirlo nunca se impide,
--    aunque siga sin cubrir: es justo el camino para arreglar uno que ya se
--    había pasado. Con tope cero no compara, como el de los pagos.
-- 2. El de los pagos no comprueba nada si ni el importe ni el gasto cambian, y
--    bloquea la fila del gasto para que dos escrituras a la vez no quepan las
--    dos contra la misma suma.
--
-- Rollback: supabase/migrations/rollback/20261005120000_gasto_no_baja_de_sus_pagos.sql
-- ============================================================================

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
  -- Cambiar la fecha, las notas o quién paga no mueve el dinero: no hay nada
  -- que comprobar. Comprobarlo igual dejaba sin poder tocar ninguno de los
  -- pagos de un gasto que se había pasado.
  if tg_op = 'UPDATE'
     and new.importe = old.importe
     and new.partida_id = old.partida_id then
    return new;
  end if;

  -- `for no key update`: dos pagos al mismo gasto a la vez, o un pago y una
  -- bajada del gasto, se ponen en fila. Sin esto los dos comprobaban contra la
  -- misma suma y los dos cabían, juntos ya no.
  select coalesce(p.importe_real, p.importe_estimado)
    into v_tope
    from public.partidas_presupuesto as p
   where p.id = new.partida_id
     for no key update;

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

create or replace function public.exigir_gasto_por_encima_de_sus_pagos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tope     numeric(12, 2) := coalesce(new.importe_real, new.importe_estimado);
  v_antes    numeric(12, 2) := coalesce(old.importe_real, old.importe_estimado);
  v_apuntado numeric(12, 2);
begin
  -- Sin tope no hay con qué comparar, y subir nunca deja a nadie fuera.
  if coalesce(v_tope, 0) <= 0 or v_tope >= coalesce(v_antes, 0) then
    return new;
  end if;

  select coalesce(sum(pg.importe), 0)
    into v_apuntado
    from public.pagos as pg
   where pg.partida_id = new.id;

  if v_apuntado > v_tope then
    raise exception 'PAR01'
      using errcode = 'check_violation',
            detail  = format('gasto=%s tope=%s apuntado=%s', new.id, v_tope, v_apuntado),
            hint    = 'Hay más apuntado en pagos que el nuevo importe. Bajad antes los pagos.';
  end if;

  return new;
end;
$$;

comment on function public.exigir_gasto_por_encima_de_sus_pagos() is
  'Impide BAJAR el importe acordado —o el estimado mientras no haya acuerdo— de '
  'una partida por debajo de la suma de sus pagos. Lanza PAR01. Subirlo no se '
  'impide nunca, y con tope cero no compara.';

create or replace trigger partidas_por_encima_de_sus_pagos
  before update of importe_real, importe_estimado on public.partidas_presupuesto
  for each row
  execute function public.exigir_gasto_por_encima_de_sus_pagos();

-- Como la de los pagos: una función de trigger no se publica por RPC.
revoke execute on function public.exigir_gasto_por_encima_de_sus_pagos()
  from public, anon, authenticated;
