-- Rollback de 20260810220000_contactos_proveedor.sql
--
-- Se lleva la tabla de contactos y con ella sus filas: no hay forma de
-- conservarlas si la tabla no existe. Antes de ejecutarlo, el teléfono del jefe
-- de sala hay que apuntarlo en otro sitio.
--
-- NO BORRA LAS CATEGORÍAS. La migración las inserta sólo si la tabla estaba
-- vacía, pero para cuando se deshaga puede haber proveedores colgando de ellas
-- —y `proveedores.categoria_id` es `on delete restrict`, así que el borrado
-- fallaría a medias— o pueden haberse renombrado y ser ya las de esta boda.
-- Una migración de datos que se rehace sola no se deshace a ciegas: si de
-- verdad sobran, se borran una a una desde el panel, que además avisa de lo
-- que cuelga de cada una.

drop policy if exists contactos_proveedor_escribir on public.contactos_proveedor;
drop policy if exists contactos_proveedor_leer on public.contactos_proveedor;

drop table if exists public.contactos_proveedor;
