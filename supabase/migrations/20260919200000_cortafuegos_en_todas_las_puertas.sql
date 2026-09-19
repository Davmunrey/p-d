-- ============================================================================
-- El cortafuegos cubre TODAS las puertas públicas, y el plazo todas las
-- escrituras
--
-- Cinco cosas, las cinco reproducidas sobre una base con las 49 migraciones
-- aplicadas antes de escribir una línea:
--
-- 1 · `sugerir_cancion()` anotaba el intento fallido y ACTO SEGUIDO lanzaba
--     `CAN02`. La excepción aborta la transacción y se lleva el INSERT en
--     `intentos_rsvp` con ella: dos llamadas con un token inventado dejaban
--     CERO filas, mientras que una sola a `obtener_invitacion()` dejaba una.
--     Es exactamente el fallo que la cabecera de `funciones_publicas.sql`
--     explica y por el que las tres funciones del RSVP devuelven vacío en vez
--     de lanzar. Esta nació después y no siguió la regla, así que sondear
--     tokens por la playlist no disparaba `RSV02` jamás.
--
-- 2 · `destinatarios_confirmacion()` resolvía el token sin pasar por el cupo
--     ni anotar nada: la cuarta puerta pública, y la única sin cortafuegos.
--
-- 3 · `anadir_acompanante()` daba de alta con el plazo vencido. El trigger de
--     plazo sólo vigila `confirmaciones` con `origen = 'publico'`, y la fila
--     inicial que crea `crear_confirmacion_inicial()` lleva `origen =
--     'sistema'`, así que nada la cortaba. Ninguna pantalla la llama hoy, pero
--     está concedida a `anon`, y «que nadie conozca la RPC» no es una defensa.
--
-- 4 · `alter default privileges IN SCHEMA public revoke execute on functions
--     from public` ES UN NO-OP. PostgreSQL guarda los privilegios por defecto
--     «in schema» como un delta sobre el default global, y revocar sobre un
--     delta vacío deja un delta vacío: no se almacena nada y no puede retirar
--     el EXECUTE cableado para PUBLIC. `pg_default_acl` tenía cero filas. El
--     repositorio vio el síntoma —«toda función nueva sigue naciendo con
--     EXECUTE para PUBLIC»—, lo atribuyó a Supabase y lo compensó con un
--     `revoke` a mano por función. Esa disciplina ya falló una vez:
--     `avisos_programa_validos()` nació sin él y era la séptima función que
--     `anon` podía invocar por RPC. La forma GLOBAL (sin `in schema`) sí se
--     guarda y la siguiente función nace sin EXECUTE: comprobado.
--
-- 5 · Cada «Cambiar la respuesta» volvía a apuntar la misma canción. `reabrir`
--     siembra el borrador con la canción vigente, el envío la manda otra vez y
--     `sugerir_cancion()` insertaba sin mirar: la portada enseñaba «X» dos
--     veces y el grupo gastaba dos de sus diez plazas. A la tercera edición,
--     tres.
--
-- Rollback: supabase/migrations/rollback/20260919200000_cortafuegos_en_todas_las_puertas.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1 + 5. sugerir_cancion: NULL = enlace no válido, y la misma canción del
--        mismo grupo es la que ya estaba.
-- ----------------------------------------------------------------------------

-- Lo que el fallo 5 dejó en la tabla: la misma canción del mismo grupo, varias
-- veces. Se queda la primera, que es la que el invitado escribió; las demás
-- son las que reescribió el formulario al reeditar. Sin esto el índice único
-- de abajo no se puede crear.
delete from public.canciones_sugeridas as repetida
 using public.canciones_sugeridas as primera
 where repetida.grupo_id = primera.grupo_id
   and lower(btrim(repetida.texto)) = lower(btrim(primera.texto))
   and (repetida.creado_en, repetida.id) > (primera.creado_en, primera.id);

-- El índice es lo que lo hace airtight: dos envíos iguales que lleguen a la vez
-- no pueden colar dos filas por mucho que la función mire antes de insertar.
-- Parcial, porque `grupo_id` se pone a null cuando el grupo desaparece y ahí
-- ya no hay «mismo grupo» que comparar.
create unique index if not exists idx_canciones_grupo_texto
  on public.canciones_sugeridas (grupo_id, lower(btrim(texto)))
  where grupo_id is not null;

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

  -- NULL = enlace no válido, como las tres funciones del RSVP. Antes se
  -- lanzaba `CAN02`, y la excepción se llevaba por delante el registro del
  -- intento: el cortafuegos no contaba ni uno. Lanzar aquí es dejar la
  -- playlist abierta a sondear tokens sin límite.
  if v_grupo_id is null then
    perform public.registrar_intento_rsvp(p_token, false);
    return null;
  end if;

  perform public.registrar_intento_rsvp(p_token, true);

  -- LA MISMA CANCIÓN DEL MISMO GRUPO ES LA QUE YA ESTABA. Se compara sin
  -- mayúsculas ni espacios de más porque «bailando» y «Bailando » son la
  -- misma petición, y va ANTES del tope: repetir la que ya está no puede
  -- costar una plaza ni chocar contra las diez.
  select c.id into v_id
    from public.canciones_sugeridas as c
   where c.grupo_id = v_grupo_id
     and lower(btrim(c.texto)) = lower(v_texto);

  if v_id is not null then
    return v_id;
  end if;

  -- Tope por grupo: evita que una familia llene la lista ella sola, por
  -- entusiasmo o por accidente con el botón.
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
  on conflict (grupo_id, lower(btrim(texto))) where grupo_id is not null do nothing
  returning id into v_id;

  -- Dos envíos iguales a la vez: el segundo no inserta y devuelve el que ganó.
  if v_id is null then
    select c.id into v_id
      from public.canciones_sugeridas as c
     where c.grupo_id = v_grupo_id
       and lower(btrim(c.texto)) = lower(v_texto);
  end if;

  return v_id;
end;
$function$;

comment on function public.sugerir_cancion(text, text) is
  'Añade una canción a la playlist. Devuelve NULL si el enlace no es válido —no '
  'lanza, para que el intento fallido quede anotado en el cortafuegos—, el id '
  'de la que ya estaba si el grupo repite la misma canción, y limita a diez por '
  'grupo.';

-- ----------------------------------------------------------------------------
-- 2. destinatarios_confirmacion: mismo cortafuegos y misma resolución por
--    huella que las demás puertas públicas.
-- ----------------------------------------------------------------------------

create or replace function public.destinatarios_confirmacion(p_token text)
returns setof text
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_grupo_id uuid;
begin
  perform public.exigir_cupo_rsvp();

  select g.id into v_grupo_id
    from public.grupos_invitacion as g
   where g.huella_token = public.huella_token(p_token);

  -- Cero filas = enlace no válido, y el intento queda anotado. Es la misma
  -- regla que `obtener_invitacion()`: esta puerta resuelve un token igual que
  -- aquélla, y era la única por la que se podía sondear sin que contara.
  if v_grupo_id is null then
    perform public.registrar_intento_rsvp(p_token, false);
    return;
  end if;

  perform public.registrar_intento_rsvp(p_token, true);

  return query
    select distinct i.correo_electronico
      from public.invitados as i
     where i.grupo_id = v_grupo_id
       and i.correo_electronico is not null;
end;
$function$;

comment on function public.destinatarios_confirmacion(text) is
  'Las direcciones a las que mandar el acuse de recibo de un grupo, y nada más: '
  'ni nombres ni de quién es cada una. `obtener_invitacion()` no las devuelve a '
  'propósito —un invitado no tiene por qué recibir los datos de contacto de sus '
  'coinvitados— y esta puerta existe para el envío, no para la pantalla. Pasa '
  'por el mismo cortafuegos que las demás: cero filas es enlace no válido.';

-- ----------------------------------------------------------------------------
-- 3. anadir_acompanante: el plazo se cumple en la base, también aquí.
-- ----------------------------------------------------------------------------

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
  v_limite      timestamptz;
begin
  perform public.exigir_cupo_rsvp();

  select g.id into v_grupo_id
    from public.grupos_invitacion as g
   where g.huella_token = public.huella_token(p_token);

  -- RSV01: NULL = enlace no válido.
  if v_grupo_id is null then
    perform public.registrar_intento_rsvp(p_token, false);
    return null;
  end if;

  -- RSV03, el mismo código y el mismo criterio que el trigger de plazo sobre
  -- `confirmaciones`: siempre contra `now()`, nunca contra una fecha que mande
  -- el cliente. El trigger no llega aquí porque la confirmación inicial del
  -- acompañante nace con `origen = 'sistema'`, que es justo lo que deja
  -- pasar; así que se mira antes de escribir nada.
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
  'es válido y lanza RSV03 si el plazo de confirmación ya pasó. `grupo_id` y '
  '`es_acompanante` los fija el servidor: el invitado no puede añadir gente a '
  'otra invitación ni colar a alguien como titular para no consumir plaza.';

-- ----------------------------------------------------------------------------
-- 4. Default privileges que existen de verdad, y la función que se escapó.
-- ----------------------------------------------------------------------------

-- La forma GLOBAL. Sin `in schema`: es la única que se almacena y la única que
-- retira el EXECUTE para PUBLIC con el que PostgreSQL hace nacer toda función.
-- Las funciones que ya existen no cambian —los privilegios por defecto sólo
-- valen para lo que se cree a partir de ahora—, así que las RPC del RSVP, las
-- de las políticas y las de los CHECK siguen con los grants que ya tienen.
do $$
begin
  execute 'alter default privileges revoke execute on functions from public';

  -- Por rol creador, como en la migración base: si las aplica `postgres` desde
  -- otro rol miembro, que valga también para lo que cree `postgres`.
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'postgres')
     and current_user <> 'postgres'
     and pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    execute 'alter default privileges for role postgres revoke execute on functions from public';
  end if;
exception
  when insufficient_privilege then
    raise warning 'Sin permiso para tocar los default privileges: el revoke por función sigue siendo la única red.';
end $$;

-- La que se escapó. Es pura e inmutable y no lee ninguna tabla, así que abierta
-- no revelaba nada; se cierra porque el invariante es «ninguna función
-- ejecutable por anon salvo las puertas del RSVP», y un invariante con una
-- excepción sin decidir no es un invariante. `authenticated` la necesita: vive
-- en un CHECK de `configuracion_boda`, y PostgreSQL exige EXECUTE al rol que
-- escribe la fila (ver `es_correo_valido` en la migración base).
revoke execute on function public.avisos_programa_validos(text[]) from public, anon, authenticated;
grant execute on function public.avisos_programa_validos(text[]) to authenticated;

commit;
