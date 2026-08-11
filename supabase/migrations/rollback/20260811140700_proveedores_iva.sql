-- Rollback de 20260811140700_proveedores_iva.sql

alter table public.proveedores drop column if exists iva_incluido;
