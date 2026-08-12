-- ============================================================================
-- 20260811150000_tareas_orden.sql
-- Ticket: BODA-81 (#57) · El tablero de tareas
--
-- Qué hace este fichero:
--   1. `tareas.orden`: el sitio de cada tarea DENTRO de su columna, puesto a
--      mano desde el tablero. Sin esta columna, subir o bajar una tarjeta es
--      un gesto que se pierde al recargar.
--   2. `v_tareas`: la vista del módulo. Trae el nombre del responsable y del
--      proveedor ya resueltos y —lo importante— dice cuántos días faltan para
--      el vencimiento **contando con la fecha de la base**.
--
-- POR QUÉ EL PLAZO LO CUENTA LA BASE. Es la misma decisión que en `v_pagos`, y
-- por el mismo motivo: preguntarle al navegador qué día es hoy es preguntárselo
-- a un reloj que puede estar mal puesto o en otro huso, y una tarea que aparece
-- vencida un día antes —o un día después— no sirve para lo único que tiene que
-- servir. Aquí se devuelven los días que faltan y no una etiqueta cerrada: a
-- partir de cuántos días una tarea «vence pronto» es una decisión de producto y
-- vive con las demás, en `src/config/constants.ts`.
--
-- `orden` ES `smallint` Y ADMITE NULOS. Una tarea recién creada no tiene sitio
-- elegido: cae al final por prioridad y fecha, que es el orden natural, y sólo
-- pasa a tener número cuando alguien la mueve. Un `not null default 0` habría
-- puesto a las veinte tareas nuevas empatadas en la primera posición.
--
-- Rollback: supabase/migrations/rollback/20260811150000_tareas_orden.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. El sitio dentro de la columna
-- ---------------------------------------------------------------------------

alter table public.tareas
  add column if not exists orden smallint;

comment on column public.tareas.orden is
  'Posición manual dentro de su columna del tablero. NULL es «donde caiga»: se '
  'ordena por prioridad y fecha límite hasta que alguien la mueve.';

alter table public.tareas
  drop constraint if exists tareas_orden_no_negativo;
alter table public.tareas
  add constraint tareas_orden_no_negativo
  check (orden is null or orden >= 0);

-- El tablero pide una columna entera y la pinta en orden. Sin este índice, cada
-- una de las tres columnas es un recorrido completo de la tabla más una
-- ordenación en memoria.
create index if not exists tareas_estado_orden_idx
  on public.tareas (estado, orden nulls last);

-- ---------------------------------------------------------------------------
-- 2. La vista del módulo
-- ---------------------------------------------------------------------------
--
-- `security_invoker` para que la vista se lea con los permisos de quien
-- pregunta y no con los de quien la creó: sin eso, una vista es un agujero por
-- el que se salta RLS.
--
-- Los nombres del responsable y del proveedor vienen con `left join` y no con
-- `join` a secas: una tarea sin asignar —que es la mitad de la lista al empezar—
-- tiene que salir igual. Un `join` interno las haría desaparecer del tablero
-- justo por no tener dueño todavía.

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
  -- Días que faltan, con la fecha del servidor. Negativo es tarde, cero es hoy
  -- y NULL es una tarea sin plazo, que no es lo mismo que una tarea a tiempo.
  (t.fecha_limite - current_date)::int as dias_para_vencer,
  t.creado_en
from public.tareas as t
left join public.perfiles as p on p.id = t.responsable_id
left join public.proveedores as pr on pr.id = t.proveedor_id;

comment on view public.v_tareas is
  'Las tareas con su responsable y su proveedor ya resueltos, y con los días '
  'que faltan para el vencimiento contados por la base. Es la única cuenta de '
  '«cuánto queda» del módulo.';

grant select on public.v_tareas to authenticated;

commit;
