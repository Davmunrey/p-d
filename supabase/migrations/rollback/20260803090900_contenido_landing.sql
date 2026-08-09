-- Rollback de 20260803090900_contenido_landing.sql
--
-- Elimina las tablas de contenido de la landing y la función de la playlist.
--
-- AVISO: esto borra el contenido de la web —programa, alojamientos, rutas,
-- preguntas frecuentes, historia y las canciones que hayan sugerido los
-- invitados—. Haced copia antes si la boda ya está en marcha.

drop function if exists public.sugerir_cancion(text, text);

drop table if exists public.canciones_sugeridas;
drop table if exists public.hitos_historia;
drop table if exists public.preguntas_frecuentes;
drop table if exists public.rutas_llegada;
drop table if exists public.alojamientos;
drop table if exists public.hitos_programa;
