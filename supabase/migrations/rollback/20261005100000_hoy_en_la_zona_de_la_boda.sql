-- Reverso de 20261005100000_hoy_en_la_zona_de_la_boda.sql
--
-- Devuelve `v_pagos` y `v_tareas` a contar con `current_date` (el día de la
-- sesión, UTC en Supabase) y borra `hoy_en_la_boda()`. Las vistas van primero:
-- la función no se puede borrar mientras ellas dependan de ella.

begin;

create or replace view public.v_pagos
with (security_invoker = true) as
select
  pg.id,
  pg.partida_id,
  pa.concepto,
  ca.id            as categoria_id,
  ca.nombre        as categoria,
  pr.nombre        as proveedor,
  pg.importe,
  pg.fecha_vencimiento,
  pg.pagado_en,
  pg.metodo,
  pg.paga,
  pg.paga_detalle,
  pg.notas,
  pg.pagado_en is null and pg.fecha_vencimiento < current_date as vencido
from public.pagos as pg
join public.partidas_presupuesto as pa on pa.id = pg.partida_id
join public.categorias_presupuesto as ca on ca.id = pa.categoria_id
left join public.proveedores as pr on pr.id = pa.proveedor_id;

comment on view public.v_pagos is
  'Todos los pagos con su gasto, su categoría y su proveedor ya resueltos, y si '
  'están vencidos según la fecha del servidor. Es la única definición de '
  '«vencido» del proyecto.';

create or replace view public.v_tareas
with (security_invoker = true) as
select
  t.id,
  t.titulo,
  t.descripcion,
  t.estado,
  t.prioridad,
  t.fecha_limite,
  t.completada_en,
  t.categoria,
  t.orden,
  t.responsable_id,
  p.nombre_completo as responsable,
  t.proveedor_id,
  pr.nombre as proveedor,
  (t.fecha_limite - current_date)::int as dias_para_vencer,
  t.creado_en
from public.tareas as t
left join public.perfiles as p on p.id = t.responsable_id
left join public.proveedores as pr on pr.id = t.proveedor_id;

comment on view public.v_tareas is
  'Las tareas con su responsable y su proveedor ya resueltos, y con los días '
  'que faltan para el vencimiento contados por la base. Es la única cuenta de '
  '«cuánto queda» del módulo.';

drop function if exists public.hoy_en_la_boda();

commit;
