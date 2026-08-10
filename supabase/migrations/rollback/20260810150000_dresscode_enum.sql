-- Rollback de 20260810150000_dresscode_enum.sql
--
-- NO SE PUEDE DESHACER DEL TODO, y conviene decirlo en voz alta en lugar de
-- fingir que sí: PostgreSQL no permite quitar un valor de un enumerado, así que
-- `seccion_landing` se queda con 'dresscode' para siempre.
--
-- Lo que sí se puede es dejar el sistema como si la sección no existiera, que
-- es lo que hace el rollback de la migración siguiente: quita la tabla, las
-- filas y los permisos. Un valor huérfano del enumerado no molesta a nadie —no
-- lo referencia ninguna fila— y volver a aplicar la migración lo reutiliza.

select 'Los valores de enumerado no se retiran: ver el comentario de arriba.' as aviso;
