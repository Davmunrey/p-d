-- Rollback de 20261102170000_retrato_enum.sql
--
-- NO HAY NADA QUE DESHACER, por lo mismo que con `paisaje`: PostgreSQL no sabe
-- quitar un valor de un enumerado sin recrear el tipo y reescribir las
-- columnas que lo usan, con las tablas bloqueadas. El rollback de la migración
-- siguiente quita la fila y la columna, que es lo que hace que el retrato deje
-- de existir; `retrato` se queda en el enumerado como un valor que nadie usa.
select 1;
