-- Reverso de 20261005100100_auditoria_documentos_boda.sql
--
-- Quita el trigger de auditoría de `documentos_boda`. Lo que ya se hubiera
-- anotado en `registro_auditoria` se queda: es historia, no esquema.

begin;

drop trigger if exists documentos_boda_auditoria on public.documentos_boda;

commit;
