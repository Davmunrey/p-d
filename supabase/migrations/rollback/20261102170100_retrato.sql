-- Rollback de 20261102170100_retrato.sql
--
-- Las fotos del retrato se quedan en `medios` —son ficheros de Storage con su
-- fila, y borrarlas aquí sería perderlas—, pero sin estrellas y sin sección.
delete from public.secciones_landing where seccion = 'retrato';
alter table public.medios drop constraint if exists medios_estrellas_del_retrato;
alter table public.medios drop column if exists estrellas;
