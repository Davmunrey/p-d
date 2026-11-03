-- ============================================================================
-- «Mientras estáis por aquí»: el valor del enumerado
--
-- Va solo, como el del retrato: un valor nuevo de un enumerado no se puede
-- usar en la misma transacción que lo crea, y la migración de la tabla y de su
-- fila en `secciones_landing` lo usa. Por eso son dos ficheros.
-- ============================================================================

alter type public.seccion_landing add value if not exists 'planes' after 'dresscode';
