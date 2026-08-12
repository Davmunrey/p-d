-- Rollback de 20260811140900_auditoria_contactos.sql

drop trigger if exists contactos_proveedor_auditoria on public.contactos_proveedor;
