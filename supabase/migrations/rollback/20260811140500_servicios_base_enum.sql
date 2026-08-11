-- Rollback de 20260811140500_servicios_base_enum.sql
--
-- Sólo tiene sentido después de deshacer 20260811140600_servicios_minimo.sql:
-- un enum con una columna colgando no se puede borrar.

drop type if exists public.base_servicio;
