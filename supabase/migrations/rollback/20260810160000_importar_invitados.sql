-- Rollback de 20260810160000_importar_invitados.sql
--
-- Sólo quita la función. Lo que se haya importado con ella son invitados
-- normales y corrientes —filas de `grupos_invitacion` y de `invitados`, iguales
-- que las creadas a mano— y no se tocan: borrarlas sería tirar la lista de
-- invitados de la boda por deshacer una migración.

drop function if exists public.importar_invitados(jsonb);
