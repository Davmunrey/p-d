-- ============================================================================
-- 20261005100000_hoy_en_la_zona_de_la_boda.sql
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero: que «vencido» y «días para vencer» se cuenten con el
-- día de la boda, no con el del servidor.
--
--
-- EL FALLO.
--
-- `v_pagos` decidía `vencido` con `fecha_vencimiento < current_date`, y
-- `v_tareas` contaba `dias_para_vencer` con `fecha_limite - current_date`.
-- `current_date` es el día en la zona horaria de la SESIÓN, y en Supabase —como
-- en cualquier PostgreSQL que nadie ha tocado— esa zona es UTC: ni PostgREST
-- ni supabase-js la cambian. Así que entre la medianoche y las dos de la
-- madrugada en Madrid (la una en invierno) la base vive todavía en el día de
-- ayer:
--
--   · un pago que venció ayer sale en «próximos» y no en «vencidos», y el
--     total vencido no lo suma;
--   · una tarea que vence hoy dice «falta 1 día», y una que venció ayer dice
--     «hoy».
--
-- Es justo la franja en la que se repasan las cuentas, y el mismo fallo que
-- 3ea49f8 arregló al marcar un pago como pagado. Las cabeceras de pagos.ts y
-- tareas.ts prometen que «vencido» lo decide la base precisamente para que no
-- salga un día antes o un día después.
--
--
-- EL ARREGLO.
--
-- Una sola definición de «hoy»: `hoy_en_la_boda()`, el día de `now()` en
-- `configuracion_boda.zona_horaria`, que es la zona que ya usa
-- `v_documentos_boda` para la fecha de la ceremonia. Si todavía no hay
-- configuración —una base recién creada— vale `current_date`: mejor un día
-- en UTC que un NULL que deje todos los pagos sin decidir.
--
-- Es `stable` y `security invoker`: no eleva nada, lee la misma fila pública
-- que lee cualquier pantalla. Las dos vistas siguen siendo `security_invoker`
-- y conservan el nombre, el orden y el tipo de cada columna, porque
-- `v_proximos_pagos` cuelga de `v_pagos` y hay código leyendo las dos.
--
-- Rollback: rollback/20261005100000_hoy_en_la_zona_de_la_boda.sql
-- ============================================================================

begin;

create or replace function public.hoy_en_la_boda()
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (
      select (now() at time zone c.zona_horaria)::date
        from public.configuracion_boda as c
       limit 1
    ),
    current_date
  )
$$;

comment on function public.hoy_en_la_boda() is
  'El día de hoy en la zona horaria de la boda (configuracion_boda.zona_horaria), '
  'no en la de la sesión, que en Supabase es UTC. Es la única definición de «hoy» '
  'para vencimientos y plazos. Sin configuración, current_date.';

-- Una función nueva nace sin EXECUTE para nadie (20260919200000). La usan las
-- vistas del panel, que se leen como `authenticated`.
grant execute on function public.hoy_en_la_boda() to authenticated, service_role;

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
  pg.pagado_en is null and pg.fecha_vencimiento < public.hoy_en_la_boda() as vencido
from public.pagos as pg
join public.partidas_presupuesto as pa on pa.id = pg.partida_id
join public.categorias_presupuesto as ca on ca.id = pa.categoria_id
left join public.proveedores as pr on pr.id = pa.proveedor_id;

comment on view public.v_pagos is
  'Todos los pagos con su gasto, su categoría y su proveedor ya resueltos, y si '
  'están vencidos según el día de hoy en la zona de la boda (hoy_en_la_boda()). '
  'Es la única definición de «vencido» del proyecto.';

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
  -- Días que faltan, contados desde hoy EN LA ZONA DE LA BODA. Negativo es
  -- tarde, cero es hoy y NULL es una tarea sin plazo, que no es lo mismo que
  -- una tarea a tiempo.
  (t.fecha_limite - public.hoy_en_la_boda())::int as dias_para_vencer,
  t.creado_en
from public.tareas as t
left join public.perfiles as p on p.id = t.responsable_id
left join public.proveedores as pr on pr.id = t.proveedor_id;

comment on view public.v_tareas is
  'Las tareas con su responsable y su proveedor ya resueltos, y con los días '
  'que faltan para el vencimiento contados desde hoy en la zona de la boda. Es '
  'la única cuenta de «cuánto queda» del módulo.';

commit;
