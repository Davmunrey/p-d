-- Rollback de 20260811150000_tareas_orden.sql
--
-- Quita la vista, el índice y la restricción. La COLUMNA `orden` se borra
-- también: a diferencia de `motivo_descarte`, aquí no hay nada escrito a mano
-- que se pierda — es la posición de una tarjeta en un tablero, y sin el tablero
-- que la usa no significa nada.
--
-- Ojo al orden: la vista lee `orden`, así que se cae primero ella. Al revés,
-- PostgreSQL se niega a borrar la columna por dependencia.

drop view if exists public.v_tareas;

drop index if exists public.tareas_estado_orden_idx;

alter table public.tareas
  drop constraint if exists tareas_orden_no_negativo;

alter table public.tareas
  drop column if exists orden;
