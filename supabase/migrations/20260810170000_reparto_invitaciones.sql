-- ============================================================================
-- BODA-110 · Repartir invitaciones por WhatsApp
--
-- Nadie va a mandar doscientos correos. Las invitaciones de boda se reparten
-- por WhatsApp, de una en una y a mano, y lo que se puede automatizar no es el
-- envío: es **no equivocarse de enlace**. Mandarle a una familia el enlace de
-- otra le deja ver quién viene, qué come y qué escribieron.
--
-- LO QUE SE GUARDA ES QUE SE MANDÓ, NO QUE SE ENTREGÓ. WhatsApp se abre en otra
-- aplicación y desde aquí no hay forma de saber si el mensaje llegó a salir; lo
-- que se registra es que quien organiza pulsó el botón. Es exactamente la
-- información que hace falta —«¿a quién le falta que le mande la invitación?»—
-- y fingir más certeza de la que hay sería peor que no guardar nada.
--
-- DOS FECHAS Y NO UNA. La primera vez que se manda algo es una invitación; la
-- segunda es un recordatorio, y quien lo recibe lo lee muy distinto. Separarlas
-- es lo que permite ordenar la lista de pendientes por cuánto hace que se les
-- escribió (BODA-111) sin que un recordatorio de ayer disfrace una invitación
-- de hace tres meses.
--
-- Rollback: supabase/migrations/rollback/20260810170000_reparto_invitaciones.sql
-- ============================================================================

alter table public.grupos_invitacion
  add column if not exists invitacion_enviada_en  timestamptz,
  add column if not exists recordatorio_enviado_en timestamptz;

comment on column public.grupos_invitacion.invitacion_enviada_en is
  'Cuándo se repartió la invitación de este grupo. Lo marca quien organiza al '
  'abrir WhatsApp desde la ficha: es «lo mandé», no «le llegó», porque el envío '
  'ocurre en otra aplicación y desde aquí no se puede saber más que eso.';

comment on column public.grupos_invitacion.recordatorio_enviado_en is
  'Cuándo se le recordó por última vez. Separado de la invitación porque un '
  'recordatorio de ayer no puede disfrazar una invitación de hace tres meses '
  'cuando se ordena la lista de pendientes.';

-- ----------------------------------------------------------------------------
-- Marcar el reparto
-- ----------------------------------------------------------------------------
--
-- Función y no un UPDATE desde el panel por una razón concreta: las columnas de
-- `grupos_invitacion` que puede tocar el público están acotadas por RLS y por
-- el trigger de privilegios, y abrir la tabla a un UPDATE genérico desde el
-- panel para escribir una fecha sería aflojar eso. Aquí se escribe una columna,
-- se comprueba el permiso y no hay más superficie.

create or replace function public.marcar_invitacion_repartida(
  p_grupo_id uuid,
  p_recordatorio boolean default false
)
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cuando timestamptz := now();
begin
  if not public.puede_editar() then
    raise exception 'RSV06'
      using errcode = 'insufficient_privilege',
            hint    = 'Sólo un editor puede repartir invitaciones.';
  end if;

  if p_recordatorio then
    update public.grupos_invitacion
       set recordatorio_enviado_en = v_cuando
     where id = p_grupo_id;
  else
    update public.grupos_invitacion
       set invitacion_enviada_en = v_cuando
     where id = p_grupo_id;
  end if;

  if not found then
    raise exception 'RSV01'
      using errcode = 'no_data_found',
            hint    = 'Esa invitación no existe.';
  end if;

  return v_cuando;
end;
$function$;

comment on function public.marcar_invitacion_repartida(uuid, boolean) is
  'Anota que la invitación de un grupo se ha repartido, o que se le ha recordado. '
  'Escribe una fecha y nada más: no abre `grupos_invitacion` a un UPDATE genérico '
  'desde el panel, que aflojaría lo que protegen RLS y el trigger de privilegios.';

revoke all on function public.marcar_invitacion_repartida(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.marcar_invitacion_repartida(uuid, boolean) to authenticated;
