-- ============================================================================
-- ROLLBACK de 20260803090300_organizacion.sql
-- Ticket: BODA-13 (tareas, mesas del banquete y medios de la landing)
--
-- Deshace exactamente lo que hace su migración, en orden inverso:
--   1. Se descuelga el trigger de auditoría de todas las tablas de dominio.
--   2. Se suelta la clave foránea de `invitados.mesa_id`.
--   3. Se eliminan las tablas, sus funciones y sus enumerados.
--
-- La COLUMNA `invitados.mesa_id` NO se elimina aquí: la declara la migración de
-- invitados, que es donde nace la tabla que la contiene, y borrarla desde este
-- fichero destruiría el reparto de mesas al revertir sólo este bloque. Se va
-- con su tabla en el rollback de 20260803090100_invitados.sql.
-- ============================================================================

begin;

-- 1. Auditoría ----------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'perfiles', 'invitaciones_panel', 'configuracion_boda', 'configuracion_privada',
    'secciones_landing', 'grupos_invitacion', 'notas_grupo', 'invitados',
    'notas_invitado', 'confirmaciones', 'categorias_proveedor', 'proveedores',
    'documentos_proveedor', 'servicios', 'categorias_presupuesto',
    'partidas_presupuesto', 'pagos', 'tareas', 'mesas', 'medios'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', v_tabla || '_auditoria', v_tabla);
  end loop;
end;
$$;

-- 2. Asignación de mesa -------------------------------------------------------
drop index if exists public.invitados_mesa_id_idx;
alter table if exists public.invitados drop constraint if exists invitados_mesa_id_fk;

-- 3. Tablas, funciones y tipos ------------------------------------------------
-- Las tablas arrastran sus índices, restricciones y triggers.
drop table if exists public.medios;
drop table if exists public.mesas;
drop table if exists public.tareas;

drop function if exists public.validar_texto_alternativo_medio();
drop function if exists public.asignar_orden_medio();
drop function if exists public.sellar_tarea_completada();

drop type if exists public.forma_mesa;
drop type if exists public.prioridad_tarea;
drop type if exists public.estado_tarea;

commit;
