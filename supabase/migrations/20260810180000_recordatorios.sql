-- ============================================================================
-- BODA-111 · Recordatorio a quien no ha contestado
--
-- Siempre hay un tercio que no contesta hasta que se le pregunta, y
-- perseguirlos a mano es lo que más tiempo se lleva de toda la organización.
--
-- EL CRITERIO DURO DEL TICKET ES «NUNCA ALCANZA A QUIEN YA HA RESPONDIDO, EN
-- NINGUNA CIRCUNSTANCIA», y por eso la comprobación vive aquí y no en la
-- pantalla. Entre que se abre la lista de pendientes y se pulsa el botón pasan
-- minutos, y en esos minutos alguien puede contestar desde su móvil. Si la
-- lista fuera la única guardia, ese alguien recibiría un «¿nos confirmáis?»
-- justo después de haber confirmado — que es la forma más tonta de parecer que
-- no te has enterado.
--
-- La pantalla filtra para no ofrecer lo que va a fallar. La base es la que
-- decide, y lo hace mirando el estado en el mismo instante de escribir.
--
-- EL RECORDATORIO NO LLEVA ENLACE, y es una decisión, no un olvido. La base
-- guarda la huella del token y no el token, así que meter el enlace obligaría a
-- emitir uno nuevo — y eso invalida el que la familia ya tiene en su WhatsApp.
-- Recordar no puede romper lo que se mandó: el mensaje pide que miren el enlace
-- de siempre, y si de verdad lo han perdido se emite uno nuevo desde su ficha,
-- que es un acto distinto y consciente.
--
-- Rollback: supabase/migrations/rollback/20260810180000_recordatorios.sql
-- ============================================================================

create or replace function public.marcar_recordatorio(p_grupo_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cuando timestamptz := now();
  v_limite timestamptz;
  v_respondidos integer;
begin
  if not public.puede_editar() then
    raise exception 'RSV06'
      using errcode = 'insufficient_privilege',
            hint    = 'Sólo un editor puede recordar una invitación.';
  end if;

  if not exists (select 1 from public.grupos_invitacion as g where g.id = p_grupo_id) then
    raise exception 'RSV01'
      using errcode = 'no_data_found',
            hint    = 'Esa invitación no existe.';
  end if;

  /*
    PASADO EL PLAZO NO SE RECUERDA, SE LLAMA.

    Un recordatorio automático después de la fecha límite es peor que ninguno:
    quien lo recibe entiende que todavía llega a tiempo, y para entonces el
    número ya se le ha dado al catering. A esas alturas la conversación es un
    teléfono, no un mensaje.
  */
  select c.fecha_limite_rsvp into v_limite from public.configuracion_boda as c;

  if v_limite is not null and v_limite < v_cuando then
    raise exception 'REC02'
      using errcode = 'check_violation',
            hint    = 'El plazo se ha cerrado: a estas alturas se llama, no se recuerda.';
  end if;

  -- Cuenta a quien ya ha dicho algo, sí o no. `tentativo` no cuenta como
  -- respuesta: para quien organiza, un «ya os diré» sigue siendo un pendiente.
  select count(*) into v_respondidos
    from public.invitados as i
    join public.confirmaciones as c on c.invitado_id = i.id
   where i.grupo_id = p_grupo_id
     and c.es_vigente
     and c.estado in ('confirmado', 'rechazado');

  if v_respondidos > 0 then
    raise exception 'REC01'
      using errcode = 'check_violation',
            detail  = format('grupo=%s', p_grupo_id),
            hint    = 'Esa invitación ya ha contestado: no se le recuerda nada.';
  end if;

  update public.grupos_invitacion
     set recordatorio_enviado_en = v_cuando
   where id = p_grupo_id;

  return v_cuando;
end;
$function$;

comment on function public.marcar_recordatorio(uuid) is
  'Anota que se le ha recordado a un grupo, y se niega si ese grupo ya ha '
  'contestado o si el plazo se ha cerrado. La comprobación va aquí y no en la '
  'pantalla porque entre abrir la lista de pendientes y pulsar el botón pasan '
  'minutos, y en esos minutos alguien puede contestar desde su móvil.';

revoke all on function public.marcar_recordatorio(uuid) from public, anon, authenticated;
grant execute on function public.marcar_recordatorio(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Quién está pendiente, y desde cuándo
-- ----------------------------------------------------------------------------
--
-- Vista y no consulta suelta en el servidor: la definición de «pendiente» —ni
-- una sola respuesta vigente en todo el grupo— es la misma que aplica
-- `marcar_recordatorio()`, y si viviera en dos sitios acabarían separándose. El
-- día que se separen, la pantalla ofrecería recordar a quien la base rechaza.

create or replace view public.v_grupos_pendientes
with (security_invoker = on) as
select
  g.id,
  g.nombre,
  g.lado,
  g.invitacion_enviada_en,
  g.recordatorio_enviado_en,
  -- El último contacto, sea lo que fuera. Es por lo que se ordena la lista.
  greatest(
    coalesce(g.recordatorio_enviado_en, g.invitacion_enviada_en),
    coalesce(g.invitacion_enviada_en, g.recordatorio_enviado_en)
  ) as ultimo_contacto,
  count(i.id)::integer as personas
from public.grupos_invitacion as g
join public.invitados as i on i.grupo_id = g.id
where not exists (
  select 1
    from public.invitados as ii
    join public.confirmaciones as c on c.invitado_id = ii.id
   where ii.grupo_id = g.id
     and c.es_vigente
     and c.estado in ('confirmado', 'rechazado')
)
group by g.id;

comment on view public.v_grupos_pendientes is
  'Invitaciones sin una sola respuesta, con cuándo se les escribió por última '
  'vez. Se une a `invitados` y no se listan los grupos vacíos: una invitación '
  'sin nadie dentro no tiene a quién recordarle nada, y su enlace tampoco '
  'funcionaría.';

grant select on public.v_grupos_pendientes to authenticated;
