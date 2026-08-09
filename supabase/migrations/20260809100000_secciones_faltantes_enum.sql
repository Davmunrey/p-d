-- BODA-20 · Las dos secciones que la landing pinta y el enumerado no conocía
--
-- `secciones_landing` es la lista de la que sale la navegación: qué secciones
-- se enseñan y en qué orden. Al cablearla se vio que faltaban dos de las que la
-- landing ya pinta —el programa del día y la playlist—, así que ninguna de las
-- dos podía aparecer en el menú ni apagarse desde el panel.
--
-- POR QUÉ ESTE FICHERO SOLO TOCA EL ENUMERADO
--
-- PostgreSQL no deja usar un valor nuevo de un enumerado dentro de la misma
-- transacción que lo añade. Las filas van en la migración siguiente, que corre
-- en su propia transacción: así el par funciona igual lo aplique `psql` en
-- autocommit o el CLI de Supabase envolviendo cada fichero.
--
-- `asegurar_enum` no sirve aquí: sale sin hacer nada si el tipo ya existe, que
-- es justo el caso.

alter type public.seccion_landing add value if not exists 'programa' after 'galeria';

alter type public.seccion_landing add value if not exists 'playlist' after 'preguntas_frecuentes';
