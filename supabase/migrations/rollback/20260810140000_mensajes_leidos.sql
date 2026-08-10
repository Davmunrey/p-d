-- Rollback de 20260810140000_mensajes_leidos.sql
--
-- Quita la tabla de marcas de lectura. No toca ni un mensaje: los mensajes
-- viven en `confirmaciones` y esta tabla sólo anotaba cuáles se habían leído.
--
-- Lo que se pierde es esa anotación: al volver a aplicar la migración, la
-- bandeja enseñará todos los mensajes como nuevos. Molesto, no grave.

drop table if exists public.mensajes_leidos;
