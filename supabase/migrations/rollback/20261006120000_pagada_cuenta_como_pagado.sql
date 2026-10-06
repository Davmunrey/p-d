-- Reverso de 20261006120000_pagada_cuenta_como_pagado.sql
--
-- Devuelve `v_resumen_presupuesto` a la definición de 20260803090600_vistas.sql:
-- `pagado` vuelve a sumar sólo los pagos hechos, y la casilla «Ya está pagada»
-- de un gasto deja de contar en los totales. Mismas columnas, mismo orden.

begin;

create or replace view public.v_resumen_presupuesto
with (security_invoker = on) as
select
  c.id                                           as categoria_id,
  c.nombre                                       as categoria,
  c.orden,
  c.importe_previsto,
  coalesce(sum(p.importe_estimado), 0)           as estimado,
  coalesce(sum(p.importe_real), 0)               as real,
  coalesce(sum(g.pagado), 0)                     as pagado,
  coalesce(sum(g.pendiente), 0)                  as pendiente,
  c.importe_previsto - coalesce(sum(coalesce(p.importe_real, p.importe_estimado)), 0)
                                                 as desviacion
from public.categorias_presupuesto as c
left join public.partidas_presupuesto as p
  on p.categoria_id = c.id
left join lateral (
  select
    coalesce(sum(pg.importe) filter (where pg.pagado_en is not null), 0) as pagado,
    coalesce(sum(pg.importe) filter (where pg.pagado_en is null), 0)     as pendiente
  from public.pagos as pg
  where pg.partida_id = p.id
) as g on true
group by c.id, c.nombre, c.orden, c.importe_previsto;

comment on view public.v_resumen_presupuesto is
  'Previsto contra estimado, real y pagado, por categoría. `desviacion` usa el '
  'importe real cuando existe y el estimado mientras no: es la cifra que de '
  'verdad interesa mirar, no la suma de lo que ya se ha pagado.';

commit;
