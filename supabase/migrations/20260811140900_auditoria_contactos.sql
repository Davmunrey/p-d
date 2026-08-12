-- ============================================================================
-- 20260811140900_auditoria_contactos.sql
-- Ticket: BODA-70 (#51) · Proveedores y sus categorías (remiendo)
--
-- Qué hace este fichero:
--   1. El trigger de auditoría de `contactos_proveedor`, que su migración
--      olvidó. Todas las tablas de dominio lo llevan; ésta nació sin él y
--      sus altas y borrados no dejaban rastro de quién ni cuándo.
--
-- Rollback: supabase/migrations/rollback/20260811140900_auditoria_contactos.sql
-- ============================================================================

begin;

create or replace trigger contactos_proveedor_auditoria
  after insert or update or delete on public.contactos_proveedor
  for each row execute function public.registrar_auditoria();

commit;
