-- Reverso de 20260919170000_invitacion_crea_el_perfil_si_falta.sql
--
-- Devuelve `aplicar_invitacion_panel()` a la versión de BODA-127: un UPDATE que
-- pone al día el perfil que exista, y que no hace nada —sin decirlo— cuando la
-- cuenta está en `auth.users` pero no tiene fila en `perfiles`.

begin;

create or replace function public.aplicar_invitacion_panel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.perfiles as p
     set rol    = new.rol,
         activo = true
   where p.usuario_id = (
           select u.id
             from auth.users as u
            where lower(btrim(u.email)) = new.correo_electronico
            limit 1
         )
     and (p.rol, p.activo) is distinct from (new.rol, true);

  return null;
end;
$$;

commit;
