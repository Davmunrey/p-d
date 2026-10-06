-- ============================================================================
-- 20261006130000_iban_con_digitos_de_control.sql
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero: que la base sólo acepte un IBAN cuyos dígitos de
-- control cuadren, y no cualquier cosa con forma de IBAN.
--
--
-- EL FALLO.
--
-- `configuracion_privada_iban_formato` comprobaba la forma —dos letras, dos
-- cifras y de diez a treinta caracteres— y nada más. «ES91 2100 0418 4502 0005
-- 1333», con la última cifra cambiada, o el mismo con una cifra de menos,
-- entraban, la sección de Regalos se encendía con ese número y el botón de
-- copiar se lo entregaba a los invitados. El banco de cada uno rechazaría la
-- transferencia, y los novios no se enterarían.
--
--
-- EL ARREGLO.
--
-- `es_iban_valido()` hace el módulo 97 de la ISO 13616 —las cuatro primeras
-- posiciones al final, cada letra por su número (A = 10 … Z = 35) y el resto
-- de dividir entre 97 tiene que ser 1— y, para España, exige los 24
-- caracteres. Una cifra cambiada o dos cifras seguidas trastocadas no pasan
-- nunca; una cifra de menos, casi nunca, y en España nunca por la longitud.
--
-- El panel comprueba lo mismo antes (`src/lib/iban.ts`) para decirlo en
-- castellano; esto es la red de detrás, para quien escriba por SQL.
--
-- `NOT VALID` A PROPÓSITO. Un IBAN ya guardado que no cuadre no puede tumbar el
-- despliegue: la restricción vale desde ya para todo lo que se escriba, también
-- al tocar el titular de esa misma fila, que es cuando se descubrirá y se
-- corregirá desde el panel.
--
-- EXECUTE PARA `authenticated`: PostgreSQL lo exige sobre las funciones de un
-- CHECK, y desde 20260919200000 una función nueva nace sin él. Es pura e
-- inmutable y no lee ninguna tabla; `anon` no escribe en esta tabla y queda
-- fuera.
--
-- Rollback: supabase/migrations/rollback/20261006130000_iban_con_digitos_de_control.sql
-- ============================================================================

begin;

create or replace function public.es_iban_valido(p_iban text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_reordenado text;
  v_resto      integer := 0;
  v_caracter   text;
  v_cifras     text;
  v_posicion   integer;
begin
  if p_iban is null then
    return true;
  end if;

  if p_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' then
    return false;
  end if;

  -- Un IBAN español tiene 24 caracteres, ni uno más ni uno menos.
  if left(p_iban, 2) = 'ES' and length(p_iban) <> 24 then
    return false;
  end if;

  v_reordenado := substr(p_iban, 5) || left(p_iban, 4);

  foreach v_caracter in array regexp_split_to_array(v_reordenado, '') loop
    v_cifras := case
      when v_caracter ~ '[0-9]' then v_caracter
      else (ascii(v_caracter) - ascii('A') + 10)::text
    end;
    for v_posicion in 1 .. length(v_cifras) loop
      v_resto := (v_resto * 10 + substr(v_cifras, v_posicion, 1)::integer) % 97;
    end loop;
  end loop;

  return v_resto = 1;
end;
$$;

comment on function public.es_iban_valido(text) is
  'IBAN con forma y dígitos de control correctos (módulo 97, ISO 13616), y de '
  '24 caracteres si es español. NULL vale: es «sin cuenta», que apaga Regalos.';

revoke execute on function public.es_iban_valido(text) from public, anon, authenticated;
grant execute on function public.es_iban_valido(text) to authenticated;

alter table public.configuracion_privada
  drop constraint configuracion_privada_iban_formato;

alter table public.configuracion_privada
  add constraint configuracion_privada_iban_formato
    check (public.es_iban_valido(iban_regalos)) not valid;

commit;
