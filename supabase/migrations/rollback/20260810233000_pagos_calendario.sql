-- Rollback de 20260810233000_pagos_calendario.sql
--
-- Devuelve `v_proximos_pagos` a su forma anterior —resolviendo ella misma los
-- joins—, quita la vista nueva, el trigger del tope y la restricción de
-- `paga_detalle`.
--
-- LAS DOS COLUMNAS SE QUEDAN. `paga` y `paga_detalle` dicen quién puso cada
-- pago, y eso lo escribió una persona: tirarlo al deshacer un despliegue sería
-- perder datos que no están en ningún otro sitio. Si de verdad sobran, se borran
-- a continuación y a conciencia:
--
--   alter table public.pagos drop column paga_detalle;
--   alter table public.pagos drop column paga;
--   drop type public.pagador_boda;
--
-- El tipo no se puede borrar mientras alguna columna lo use, así que ese orden
-- importa.

drop trigger if exists pagos_dentro_del_gasto on public.pagos;
drop function if exists public.exigir_pago_dentro_del_gasto();

alter table public.pagos
  drop constraint if exists pagos_detalle_solo_de_otros;

/*
  SE TIRA Y SE VUELVE A CREAR, no vale `create or replace`.

  La migración le añadió tres columnas al final —`categoria_id`, `paga` y
  `paga_detalle`— y `create or replace view` sabe añadir columnas pero no
  quitarlas: reemplazarla con la lista corta falla con «cannot drop columns from
  view». Y como cuelga de `v_pagos`, esto tiene que ir ANTES de tirar la vista
  nueva.

  Tirarla se lleva por delante sus permisos, así que se vuelven a conceder abajo.
  Sin eso, el panel se queda leyendo una vista a la que ya no tiene acceso y el
  aviso de próximos pagos aparece vacío en vez de fallar, que es peor.
*/
drop view if exists public.v_proximos_pagos;

create view public.v_proximos_pagos
with (security_invoker = on) as
select
  pg.id,
  pg.partida_id,
  pa.concepto,
  ca.nombre        as categoria,
  pr.nombre        as proveedor,
  pg.importe,
  pg.fecha_vencimiento,
  pg.fecha_vencimiento < current_date as vencido
from public.pagos as pg
join public.partidas_presupuesto as pa on pa.id = pg.partida_id
join public.categorias_presupuesto as ca on ca.id = pa.categoria_id
left join public.proveedores as pr on pr.id = pa.proveedor_id
where pg.pagado_en is null
order by pg.fecha_vencimiento;

comment on view public.v_proximos_pagos is
  'Qué hay que pagar y cuándo, con su contexto ya resuelto. Es el aviso del panel '
  'y la única consulta que responde a la pregunta operativa del día a día.';

grant select on public.v_proximos_pagos to authenticated;

drop view if exists public.v_pagos;
