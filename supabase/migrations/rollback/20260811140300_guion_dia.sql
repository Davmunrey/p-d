-- Rollback de 20260811140300_guion_dia.sql
--
-- Se lleva el guion entero, marcas de hecho incluidas. Si la jornada ya pasó,
-- el registro de auditoría conserva quién marcó qué y cuándo.

drop policy if exists guion_dia_escribir on public.guion_dia;
drop policy if exists guion_dia_leer on public.guion_dia;

drop table if exists public.guion_dia;
