-- Rollback de 20260811140000_documentos_boda_enum.sql
--
-- Sólo tiene sentido después de deshacer 20260811140100_documentos_boda.sql:
-- un enum con una tabla colgando no se puede borrar, y el error de Postgres
-- lo dirá con claridad si se intenta en el orden equivocado.

drop type if exists public.estado_documento_boda;
drop type if exists public.titular_documento;
