-- ============================================================================
-- 20261005100100_auditoria_documentos_boda.sql
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero: el trigger de auditoría de `documentos_boda`, que su
-- migración (20260812090100) olvidó.
--
-- Es el mismo olvido que 20260811140900 corrigió en `contactos_proveedor`, y
-- aquí pesa más: es la lista de los papeles de la boda —DNI, partidas de
-- nacimiento, expediente civil— y sus altas, cambios y borrados no dejaban
-- rastro de quién ni cuándo. La suite de seguridad comprueba desde ahora que
-- toda tabla de dominio lleva este trigger, para que la próxima no nazca sin él.
--
-- Rollback: rollback/20261005100100_auditoria_documentos_boda.sql
-- ============================================================================

begin;

create or replace trigger documentos_boda_auditoria
  after insert or update or delete on public.documentos_boda
  for each row execute function public.registrar_auditoria();

commit;
