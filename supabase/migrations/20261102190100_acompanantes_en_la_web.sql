-- ============================================================================
-- «¿Venís con alguien?», desde el formulario de la estrella
--
-- Cada invitación trae del panel cuántos acompañantes caben
-- (`grupos_invitacion.maximo_acompanantes`). Hasta ahora sólo los podían dar
-- de alta los novios, a mano; ahora los apunta el propio invitado al
-- confirmar, hasta ese tope, y en el paso siguiente dice su menú y sus
-- alergias como los demás.
--
-- Dos puertas, las dos tras el cortafuegos y con el plazo mirado en la base:
--
--   · `anadir_acompanante(token, nombre, apellidos, es_nino)` — lo da de alta
--     en el grupo del token. El tope lo sigue imponiendo el trigger de
--     siempre, que bloquea la fila del grupo antes de contar (RSV05): dos
--     móviles de la misma familia no pueden colar uno de más a la vez.
--   · `quitar_acompanante(token, invitado_id)` — deshace un alta equivocada.
--     Sólo un acompañante de SU grupo y que aún no haya contestado: lo que ya
--     es una respuesta no se borra desde la web, igual que el panel no deja
--     quitar a quien ya ha contestado.
--
-- El menú y las alergias NO entran por aquí: van con la respuesta, por
-- `registrar_confirmacion()`, que es donde ya se escriben para todos. Una
-- puerta con menos parámetros es una puerta con menos que vigilar.
--
-- Rollback: supabase/migrations/rollback/20261102190100_acompanantes_en_la_web.sql
-- ============================================================================

-- La firma anterior (con menú y alergias) se retiró en 20261102100000; por si
-- quedara en alguna base, fuera antes de crear la nueva.
drop function if exists public.anadir_acompanante(text, text, text, boolean, public.tipo_menu, text);

create or replace function public.anadir_acompanante(
  p_token     text,
  p_nombre    text,
  p_apellidos text default null,
  p_es_nino   boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_grupo_id    uuid;
  v_invitado_id uuid;
  v_limite      timestamptz;
begin
  perform public.exigir_cupo_rsvp();

  select g.id into v_grupo_id
    from public.grupos_invitacion as g
   where g.huella_token = public.huella_token(p_token);

  -- RSV01: NULL = enlace no válido. No lanza, para no perder el intento.
  if v_grupo_id is null then
    perform public.registrar_intento_rsvp(p_token, false);
    return null;
  end if;

  -- RSV03 contra `now()`, como el trigger de plazo de `confirmaciones`. Aquí
  -- no llega ese trigger —la confirmación inicial nace con origen `sistema`,
  -- que es justo lo que deja pasar—, así que se mira antes de escribir.
  select c.fecha_limite_rsvp into v_limite
    from public.configuracion_boda as c
   limit 1;

  if v_limite is null or now() > v_limite then
    raise exception 'RSV03'
      using errcode = 'check_violation',
            hint    = 'El plazo para confirmar asistencia está cerrado.';
  end if;

  perform public.registrar_intento_rsvp(p_token, true);
  perform set_config('boda.origen_cambio', 'rsvp:' || v_grupo_id::text, true);

  -- `grupo_id` y `es_acompanante` los fija el servidor: no se puede añadir
  -- gente a otra invitación, ni colar a alguien como titular para no gastar
  -- plaza. Los topes de nombre y apellidos son los CHECK de la tabla.
  insert into public.invitados (
    grupo_id, nombre, apellidos, es_nino, es_acompanante, tipo_menu
  )
  values (
    v_grupo_id,
    btrim(p_nombre),
    nullif(btrim(p_apellidos), ''),
    coalesce(p_es_nino, false),
    true,
    -- Un menor empieza con el infantil; en el paso siguiente se cambia.
    case when coalesce(p_es_nino, false) then 'infantil' else 'estandar' end::public.tipo_menu
  )
  returning id into v_invitado_id;

  return v_invitado_id;
end;
$$;

comment on function public.anadir_acompanante(text, text, text, boolean) is
  'Da de alta un acompañante en el grupo del token, desde el formulario de '
  'confirmación. NULL = enlace no válido; RSV03 si el plazo pasó; RSV05 (del '
  'trigger del grupo) si ya no caben más. `grupo_id` y `es_acompanante` los fija '
  'el servidor. El menú y las alergias van después, con la respuesta.';

revoke all on function public.anadir_acompanante(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.anadir_acompanante(text, text, text, boolean) to anon, authenticated;

create or replace function public.quitar_acompanante(p_token text, p_invitado_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_grupo_id uuid;
  v_limite   timestamptz;
  v_borradas integer;
begin
  perform public.exigir_cupo_rsvp();

  select g.id into v_grupo_id
    from public.grupos_invitacion as g
   where g.huella_token = public.huella_token(p_token);

  if v_grupo_id is null then
    perform public.registrar_intento_rsvp(p_token, false);
    return null;
  end if;

  select c.fecha_limite_rsvp into v_limite
    from public.configuracion_boda as c
   limit 1;

  if v_limite is null or now() > v_limite then
    raise exception 'RSV03'
      using errcode = 'check_violation',
            hint    = 'El plazo para confirmar asistencia está cerrado.';
  end if;

  perform public.registrar_intento_rsvp(p_token, true);
  perform set_config('boda.origen_cambio', 'rsvp:' || v_grupo_id::text, true);

  -- Las tres condiciones en la misma sentencia que borra: de SU grupo, un
  -- acompañante y sin respuesta. Un id de otro grupo, un titular o alguien que
  -- ya contestó no casan y no se borra nada.
  delete from public.invitados as i
   where i.id = p_invitado_id
     and i.grupo_id = v_grupo_id
     and i.es_acompanante
     and not exists (
       select 1 from public.confirmaciones as f
        where f.invitado_id = i.id
          and f.es_vigente
          and f.estado <> 'pendiente'
     );

  get diagnostics v_borradas = row_count;
  return v_borradas > 0;
end;
$$;

comment on function public.quitar_acompanante(text, uuid) is
  'Deshace desde el formulario un acompañante apuntado por error. Sólo uno del '
  'grupo del token, que sea acompañante y que no haya contestado todavía: lo que '
  'ya es una respuesta no se borra desde la web. NULL = enlace no válido; FALSE '
  '= no había nada que quitar con esas condiciones; RSV03 si el plazo pasó.';

revoke all on function public.quitar_acompanante(text, uuid) from public, anon, authenticated;
grant execute on function public.quitar_acompanante(text, uuid) to anon, authenticated;
