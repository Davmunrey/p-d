-- ============================================================================
-- BODA-57 · Correo de confirmación al invitado
--
-- El acuse de recibo que evita el «¿te llegó mi confirmación?».
--
-- HACE FALTA UNA PUERTA NUEVA Y ESTRECHA. `obtener_invitacion()` enumera sus
-- columnas a mano y NO devuelve los correos, y está bien que no lo haga: es lo
-- que impide que un invitado reciba los datos de contacto de sus coinvitados
-- sólo por abrir su enlace. Pero para mandar el acuse hace falta una dirección.
--
-- Así que esto devuelve UNA COSA Y NADA MÁS: las direcciones del grupo de ese
-- token. Sin nombres, sin decir de quién es cada una, y sólo del propio grupo.
-- Quien tiene el token es de la familia; lo que no puede es enterarse de nada
-- que no supiera ya.
--
-- Rollback: supabase/migrations/rollback/20260810200000_correo_confirmacion.sql
-- ============================================================================

create or replace function public.destinatarios_confirmacion(p_token text)
returns setof text
language sql
stable
security definer
set search_path to ''
as $function$
  select distinct i.correo_electronico
    from public.invitados as i
    join public.grupos_invitacion as g on g.id = i.grupo_id
   where g.huella_token = public.huella_token(p_token)
     and i.correo_electronico is not null;
$function$;

comment on function public.destinatarios_confirmacion(text) is
  'Las direcciones a las que mandar el acuse de recibo de un grupo, y nada más: '
  'ni nombres ni de quién es cada una. `obtener_invitacion()` no las devuelve a '
  'propósito —un invitado no tiene por qué recibir los datos de contacto de sus '
  'coinvitados— y esta puerta existe para el envío, no para la pantalla.';

revoke all on function public.destinatarios_confirmacion(text) from public, anon, authenticated;
grant execute on function public.destinatarios_confirmacion(text) to anon, authenticated;
