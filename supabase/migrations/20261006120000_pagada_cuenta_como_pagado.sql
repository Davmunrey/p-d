-- ============================================================================
-- 20261006120000_pagada_cuenta_como_pagado.sql
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero: que la casilla «Ya está pagada» de un gasto cuente
-- como pagado, que es lo que el comentario de la columna lleva prometiendo
-- desde 20260803090200.
--
--
-- EL FALLO.
--
-- `partidas_presupuesto.pagada` es la «marca manual de partida liquidada,
-- para gastos pequeños que no se desglosan en pagos». Pero `pagado` sólo
-- sumaba `pagos.pagado_en`: las invitaciones, 310 € pagados de una vez y
-- marcados como tal, seguían sumando cero en «Pagado» y la portada los contaba
-- en «Queda por pagar». La casilla sólo servía para pintar la palabra.
--
--
-- EL ARREGLO.
--
-- `v_resumen_presupuesto` cuenta como pagado, por partida:
--
--   · si tiene pagos apuntados, lo que dicen sus pagos —manda el calendario,
--     también como dice el comentario de la columna—;
--   · si no tiene ninguno y está marcada, su importe: el acordado o, mientras
--     no lo haya, el estimado, con el mismo criterio que la desviación;
--   · si no, cero.
--
-- La vista se redefine con las mismas columnas, en el mismo orden y del mismo
-- tipo, así que nada de lo que la lee tiene que cambiar.
--
-- Rollback: supabase/migrations/rollback/20261006120000_pagada_cuenta_como_pagado.sql
-- ============================================================================

create or replace view public.v_resumen_presupuesto
with (security_invoker = on) as
select
  c.id                                           as categoria_id,
  c.nombre                                       as categoria,
  c.orden,
  c.importe_previsto,
  coalesce(sum(p.importe_estimado), 0)           as estimado,
  coalesce(sum(p.importe_real), 0)               as real,
  coalesce(sum(
    case
      when g.cuantos > 0 then g.pagado
      when p.pagada then coalesce(p.importe_real, p.importe_estimado)
      else 0
    end
  ), 0)                                          as pagado,
  coalesce(sum(g.pendiente), 0)                  as pendiente,
  c.importe_previsto - coalesce(sum(coalesce(p.importe_real, p.importe_estimado)), 0)
                                                 as desviacion
from public.categorias_presupuesto as c
left join public.partidas_presupuesto as p
  on p.categoria_id = c.id
left join lateral (
  select
    count(*)                                                             as cuantos,
    coalesce(sum(pg.importe) filter (where pg.pagado_en is not null), 0) as pagado,
    coalesce(sum(pg.importe) filter (where pg.pagado_en is null), 0)     as pendiente
  from public.pagos as pg
  where pg.partida_id = p.id
) as g on true
group by c.id, c.nombre, c.orden, c.importe_previsto;

comment on view public.v_resumen_presupuesto is
  'Previsto contra estimado, real y pagado, por categoría. `desviacion` usa el '
  'importe real cuando existe y el estimado mientras no: es la cifra que de '
  'verdad interesa mirar, no la suma de lo que ya se ha pagado. `pagado` suma '
  'los pagos hechos; una partida sin pagos apuntados y marcada como pagada '
  'cuenta entera, con el mismo importe que la desviación.';
