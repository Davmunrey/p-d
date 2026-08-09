-- ============================================================================
-- ROLLBACK de 20260803090200_economia.sql
-- Ticket: BODA-13 (proveedores, servicios, presupuesto y pagos)
--
-- Deshace exactamente lo que hace su migración, en orden inverso: de la tabla
-- más dependiente a la más dependida, y los enumerados al final, que no se
-- pueden borrar mientras alguna columna los use.
--
-- Antes de las tablas se sueltan las dependencias que apuntan a `proveedores`
-- desde OTROS bloques. Sin esto, `drop table public.proveedores` aborta con
-- 2BP01 («cannot drop table proveedores because other objects depend on it»)
-- si la migración de organización sigue aplicada, y el rollback se queda a
-- medias con `pagos` y `partidas_presupuesto` ya borradas.
-- ============================================================================

begin;

alter table if exists public.tareas
  drop constraint if exists tareas_proveedor_id_fk;

drop table if exists public.pagos;
drop table if exists public.partidas_presupuesto;
drop table if exists public.categorias_presupuesto;
drop table if exists public.servicios;
drop table if exists public.documentos_proveedor;
drop table if exists public.proveedores;
drop table if exists public.categorias_proveedor;

drop type if exists public.metodo_pago;
drop type if exists public.tipo_documento_proveedor;
drop type if exists public.estado_proveedor;

commit;
