-- Rollback de 20260810230000_estados_proveedor_enum.sql
--
-- NO SE PUEDE DESHACER SIN PERDER DATOS, y conviene decirlo antes que
-- ofrecer un comando que parezca que sí.
--
-- PostgreSQL no tiene `alter type ... drop value`. Quitar un valor de un
-- enumerado obliga a crear el tipo de nuevo sin él, reasignar la columna y
-- borrar el viejo — y en el camino hay que decidir qué pasa con los
-- proveedores que estén en `presupuesto_pedido` o en `visitado`, que es
-- información que alguien apuntó a mano y que no se puede reconstruir.
--
-- Si de verdad hay que volver atrás, esto es lo que hay que ejecutar **después
-- de haber decidido a qué estado se mueven esos proveedores**:
--
--   begin;
--   update public.proveedores
--      set estado = 'contactado'
--    where estado = 'presupuesto_pedido';
--   update public.proveedores
--      set estado = 'presupuesto_recibido'
--    where estado = 'visitado';
--
--   alter type public.estado_proveedor rename to estado_proveedor_viejo;
--   create type public.estado_proveedor as enum (
--     'investigando', 'contactado', 'presupuesto_recibido',
--     'contratado', 'descartado'
--   );
--   alter table public.proveedores
--     alter column estado drop default,
--     alter column estado type public.estado_proveedor
--       using estado::text::public.estado_proveedor,
--     alter column estado set default 'investigando';
--   drop type public.estado_proveedor_viejo;
--   commit;
--
-- Se deja escrito y comentado a propósito: un rollback que borra estados de
-- proveedores sin que nadie lo haya mirado es peor que no tener rollback.
-- Antes hay que aplicar el de `20260810230100_motivo_descarte.sql`, que quita
-- la restricción que menciona `descartado`.

do $$
begin
  raise exception
    'Este rollback no es automático: quitar un valor de un enumerado obliga a '
    'decidir a qué estado se mueven los proveedores que lo usan. Los pasos '
    'están comentados en este mismo fichero.';
end $$;
