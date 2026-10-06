-- ============================================================================
-- Rollback de 20261006130000_iban_con_digitos_de_control.sql
--
-- Vuelve al CHECK de sólo forma de 20260803090000_base.sql y quita la función.
-- Un IBAN guardado mientras tanto cumple también la regla antigua, que es más
-- laxa, así que la restricción se puede validar entera.
-- ============================================================================

begin;

alter table public.configuracion_privada
  drop constraint configuracion_privada_iban_formato;

alter table public.configuracion_privada
  add constraint configuracion_privada_iban_formato
    check (iban_regalos is null or iban_regalos ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$');

drop function public.es_iban_valido(text);

commit;
