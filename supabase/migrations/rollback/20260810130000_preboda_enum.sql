-- Rollback de 20260810130000_preboda_enum.sql
--
-- NO SE PUEDE DESHACER DEL TODO, y conviene decirlo en voz alta en lugar de
-- fingir que sí: PostgreSQL no permite quitar un valor de un enumerado. Ni
-- `seccion_landing` puede perder 'preboda' ni se puede vaciar
-- `momento_programa`.
--
-- Lo que sí se puede es dejar el sistema como si la sección no existiera, que
-- es lo que hace el rollback de la migración siguiente: quita la columna, la
-- fila y el índice. Los valores huérfanos del enumerado no molestan a nadie —no
-- los referencia ninguna fila— y volver a aplicar la migración los reutiliza.
--
-- Si de verdad hiciera falta borrarlos, sería recreando los dos tipos y
-- reescribiendo todas las columnas que los usan. Eso es una migración con
-- nombre propio, no un rollback.

select 'Los valores de enumerado no se retiran: ver el comentario de arriba.' as aviso;
