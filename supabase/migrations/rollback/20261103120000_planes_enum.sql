-- Rollback de 20261103120000_planes_enum.sql
--
-- Postgres no sabe quitar un valor de un enumerado. Tras deshacer
-- 20261103120100_planes.sql no queda nada que lo use —ni la tabla, ni su fila
-- de `secciones_landing`, ni fotos de esa sección—, así que el valor se queda,
-- inerte: el frontend no lo pinta porque no está en `SECCIONES`.
select 1;
