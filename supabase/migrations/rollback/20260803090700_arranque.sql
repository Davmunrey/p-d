-- Rollback de 20260803090700_arranque.sql
--
-- Devuelve el trigger a su forma anterior y elimina la función de arranque.
--
-- AVISO: deshacer esto reintroduce el candado circular. Si la base no tiene ya
-- un propietario activo, nadie podrá acceder al panel nunca más y no habrá
-- forma de arreglarlo desde dentro de la propia base.

drop function if exists public.designar_primer_propietario(uuid, text);

create or replace function public.proteger_privilegios_perfil()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (new.rol, new.activo, new.usuario_id)
     is distinct from (old.rol, old.activo, old.usuario_id)
     and not exists (
       select 1
         from public.perfiles as p
        where p.usuario_id = auth.uid()
          and p.rol = 'propietario'
          and p.activo
     )
  then
    raise exception 'PRF01'
      using errcode  = 'insufficient_privilege',
            detail   = format('perfil=%s', old.id),
            hint     = 'Sólo un propietario puede cambiar el rol o el alta de un perfil.';
  end if;

  return new;
end;
$function$;
