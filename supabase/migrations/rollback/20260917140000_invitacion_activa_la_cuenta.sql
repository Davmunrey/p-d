-- ============================================================================
-- ROLLBACK de 20260917140000_invitacion_activa_la_cuenta.sql
-- Ticket: BODA-127 (#164)
--
-- Devuelve la invitación a lo que era: un sello que sólo cuenta en el instante
-- del alta.
--
-- ESTO NO DESHACE LOS PERFILES QUE YA SE ACTIVARON, y es a propósito. Quien
-- entró al panel mientras la migración estuvo puesta tiene acceso legítimo,
-- concedido por una lista que sólo un propietario puede escribir; apagárselo
-- aquí sería echar a alguien por un cambio de fontanería. Si además hay que
-- retirar un acceso, se retira a mano y se ve a quién.
--
-- LO QUE SÍ VUELVE A SU SITIO: el guardián, tal y como lo dejó BODA-10 —con el
-- testigo del arranque en frío, que no es de esta migración y no se toca—. Tras
-- esto vuelve también el atasco que motivó el ticket: al segundo propietario no
-- se le puede dar de alta, porque `designar_primer_propietario()` sólo sirve
-- mientras no haya ninguno.
-- ============================================================================

begin;

drop trigger if exists invitaciones_panel_aplicar on public.invitaciones_panel;
drop function if exists public.aplicar_invitacion_panel();

create or replace function public.proteger_privilegios_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Excepción de arranque (BODA-10), acotada a la transacción de
  -- `designar_primer_propietario()`.
  if coalesce(current_setting('boda.arranque_en_curso', true), 'no') = 'si' then
    return new;
  end if;

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
$$;

comment on function public.proteger_privilegios_perfil() is
  'Impide que nadie se auto-promocione. Única excepción: el arranque en frío, '
  'acotado a la transacción de designar_primer_propietario().';

comment on table public.invitaciones_panel is
  'Correos autorizados a entrar en el panel, con el rol que se les concede. Un '
  'alta en `auth.users` cuyo correo NO esté aquí genera un perfil inactivo y sin '
  'permisos: registrarse no concede absolutamente nada. Sólo `propietario` la '
  'gestiona.';

comment on column public.invitaciones_panel.rol is
  'Rol que recibirá la persona al registrarse. Cambiarlo aquí NO altera un perfil '
  'ya creado: para eso está el panel de usuarios, que pasa por '
  '`proteger_privilegios_perfil()`.';

commit;
