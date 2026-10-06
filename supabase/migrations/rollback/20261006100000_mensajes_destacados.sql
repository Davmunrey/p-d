-- Rollback de 20261006100000_mensajes_destacados.sql
--
-- Quita la tabla de mensajes destacados. No toca ni un mensaje: viven en
-- `confirmaciones` y esta tabla sólo anotaba cuáles se habían destacado.
--
-- Lo que se pierde es esa anotación: al volver a aplicar la migración, ningún
-- mensaje saldrá destacado. Molesto, no grave.

drop table if exists public.mensajes_destacados;
