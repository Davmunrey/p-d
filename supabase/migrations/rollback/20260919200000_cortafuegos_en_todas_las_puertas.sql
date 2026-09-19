-- Reverso de 20260919200000_cortafuegos_en_todas_las_puertas.sql
--
-- Devuelve las cuatro funciones a su versión anterior (sugerir_cancion lanzando
-- CAN02 y sin mirar duplicados; destinatarios_confirmacion sin cortafuegos;
-- anadir_acompanante sin plazo), quita el índice único de canciones, deja los
-- default privileges como los tenía PostgreSQL y reabre avisos_programa_validos.
-- Las canciones repetidas que la migración borró no se recuperan: eran filas
-- idénticas a la que se conservó.

begin;

create or replace function public.sugerir_cancion(p_token text, p_texto text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_grupo_id uuid;
  v_texto    text := btrim(coalesce(p_texto, ''));
  v_id       uuid;
  v_cuantas  integer;
begin
  perform public.exigir_cupo_rsvp();

  if length(v_texto) < 2 or length(v_texto) > 160 then
    raise exception 'CAN01'
      using errcode = 'check_violation',
            hint    = 'Escribid la canción y el artista, sin pasaros de largo.';
  end if;

  select g.id into v_grupo_id
    from public.grupos_invitacion as g
   where g.huella_token = public.huella_token(p_token);

  if v_grupo_id is null then
    perform public.registrar_intento_rsvp(p_token, false);
    raise exception 'CAN02'
      using errcode = 'insufficient_privilege',
            hint    = 'Ese enlace no es válido.';
  end if;

  select count(*) into v_cuantas
    from public.canciones_sugeridas as c
   where c.grupo_id = v_grupo_id;

  if v_cuantas >= 10 then
    raise exception 'CAN03'
      using errcode = 'check_violation',
            hint    = 'Ya habéis sugerido diez canciones. Con eso hay fiesta de sobra.';
  end if;

  insert into public.canciones_sugeridas (texto, grupo_id)
  values (v_texto, v_grupo_id)
  returning id into v_id;

  return v_id;
end;
$function$;

comment on function public.sugerir_cancion(text, text) is
  'Añade una canción a la playlist. Exige token de invitación válido y limita a '
  'diez por grupo.';

drop index if exists public.idx_canciones_grupo_texto;

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

create or replace function public.anadir_acompanante(
  p_token      text,
  p_nombre     text,
  p_apellidos  text default null,
  p_es_nino    boolean default false,
  p_tipo_menu  public.tipo_menu default 'estandar',
  p_alergias   text default null
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
begin
  perform public.exigir_cupo_rsvp();

  select g.id into v_grupo_id
    from public.grupos_invitacion as g
   where g.huella_token = public.huella_token(p_token);

  if v_grupo_id is null then
    perform public.registrar_intento_rsvp(p_token, false);
    return null;
  end if;

  perform public.registrar_intento_rsvp(p_token, true);
  perform set_config('boda.origen_cambio', 'rsvp:' || v_grupo_id::text, true);

  insert into public.invitados (
    grupo_id, nombre, apellidos, es_nino, es_acompanante, tipo_menu, alergias
  )
  values (
    v_grupo_id, p_nombre, p_apellidos, p_es_nino, true, p_tipo_menu, p_alergias
  )
  returning id into v_invitado_id;

  return v_invitado_id;
end;
$$;

comment on function public.anadir_acompanante(text, text, text, boolean, public.tipo_menu, text) is
  'Da de alta un acompañante en el grupo del token; devuelve NULL si el enlace no '
  'es válido. `grupo_id` y `es_acompanante` '
  'los fija el servidor: el invitado no puede añadir gente a otra invitación ni '
  'colar a alguien como titular para no consumir plaza.';

do $$
begin
  execute 'alter default privileges grant execute on functions to public';
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'postgres')
     and current_user <> 'postgres'
     and pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    execute 'alter default privileges for role postgres grant execute on functions to public';
  end if;
exception
  when insufficient_privilege then
    raise warning 'Sin permiso para tocar los default privileges.';
end $$;

grant execute on function public.avisos_programa_validos(text[]) to public;

commit;
