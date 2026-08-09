-- ============================================================================
-- 20260803090500_funciones_publicas.sql
-- Ticket: BODA-14 (funciones públicas del RSVP y emisión de enlaces)
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero:
--   1. Emisión de enlaces de invitación (`rotar_token_invitacion`,
--      `crear_grupo_invitacion`): el único sitio donde existe el token en claro.
--   2. Cortafuegos de intentos.
--   3. Las TRES funciones que puede llamar `anon`, y ninguna más:
--        · obtener_invitacion(token)
--        · registrar_confirmacion(token, respuestas)
--        · anadir_acompanante(token, ...)
--   4. Purga programada de la bitácora de intentos.
--
-- ---------------------------------------------------------------------------
-- REGLAS DE ESCRITURA DE ESTE FICHERO. No son estilo: son la compensación por
-- que `grupos_invitacion`, `invitados` y `confirmaciones` no lleven `force row
-- level security` (ver el apartado 6 de la migración de RLS). Dentro de estas
-- funciones, que son SECURITY DEFINER y propiedad del dueño de las tablas, la
-- RLS NO se evalúa. Lo único que separa a un invitado de los datos de otro es
-- cómo está escrito el SQL de aquí:
--
--   a) Ninguna función declara `returns setof <tabla>` ni usa `select *`. El
--      tipo de retorno se enumera columna a columna, de modo que añadir mañana
--      una columna sensible a `invitados` no la publica sola.
--   b) `invitado_id` JAMÁS se acepta como dato de entrada suelto: se deriva del
--      token DENTRO de la misma sentencia que lee o escribe. Un identificador
--      ajeno no produce un error: produce cero filas.
--   c) Prohibido `jsonb_populate_record` / `jsonb_to_record` contra el tipo de
--      una tabla completa. Se enumeran uno a uno los campos que el invitado
--      puede escribir; el resto (origen, registrado_por, respondido_en,
--      es_vigente) lo fija el servidor.
--   d) El plazo se comprueba siempre contra `now()`, nunca contra una fecha que
--      venga en la petición.
-- ---------------------------------------------------------------------------
--
-- ---------------------------------------------------------------------------
-- UN ENLACE NO VÁLIDO NO LANZA EXCEPCIÓN: DEVUELVE VACÍO. Y no es un capricho.
--
-- El cortafuegos cuenta los intentos fallidos guardándolos en `intentos_rsvp`.
-- Si al detectar un token inválido la función lanzara una excepción, PostgREST
-- abortaría la transacción y ese INSERT se iría con ella: la bitácora sólo
-- acabaría conteniendo intentos con ÉXITO y el límite no saltaría jamás. Se ha
-- comprobado sobre la base real —quince intentos fallidos seguidos dejaban cero
-- filas registradas—, así que el cortafuegos habría sido decorativo.
--
-- PostgreSQL no tiene transacciones autónomas, de modo que la única forma de que
-- el registro del intento sobreviva es no abortar. Contrato resultante:
--
--   · obtener_invitacion      → cero filas   = enlace no válido
--   · registrar_confirmacion  → devuelve 0   = enlace no válido
--   · anadir_acompanante      → devuelve NULL = enlace no válido
--
-- Las excepciones se reservan para lo que SÍ tiene que deshacer escritura.
-- ---------------------------------------------------------------------------
--
-- Códigos de error (el copy visible vive en content/copy.es.json):
--   RSV01  enlace no válido      — NO es excepción: es un resultado vacío
--   RSV02  demasiados intentos                     (excepción: corta en seco)
--   RSV03  plazo de confirmación cerrado           (lo lanza el trigger de plazo)
--   RSV04  el invitado no pertenece a esta invitación
--   RSV05  el grupo ha agotado sus acompañantes    (lo lanza el trigger de aforo)
--   RSV06  intento de cambiar privilegios de la invitación
--   RSV07  respuesta fechada en el futuro
--
-- Rollback: supabase/migrations/rollback/20260803090500_funciones_publicas.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Emisión de enlaces
--    El texto plano del token existe exactamente una vez: como valor devuelto
--    por estas funciones. No se guarda, no se registra y no se puede recuperar;
--    si se pierde, se emite otro.
-- ----------------------------------------------------------------------------

create or replace function public.rotar_token_invitacion(p_grupo_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.puede_editar() then
    raise exception 'RSV06'
      using errcode = 'insufficient_privilege',
            hint    = 'Sólo un editor puede emitir enlaces de invitación.';
  end if;

  v_token := public.generar_token_invitacion();

  update public.grupos_invitacion
     set huella_token       = public.huella_token(v_token),
         token_emitido_en = now()
   where id = p_grupo_id;

  if not found then
    raise exception 'RSV01'
      using errcode = 'no_data_found',
            hint    = 'No existe esa invitación.';
  end if;

  return v_token;
end;
$$;

comment on function public.rotar_token_invitacion(uuid) is
  'Emite un enlace nuevo para un grupo y devuelve el token en claro UNA sola vez. '
  'Invalida el anterior en el acto, así que sirve tanto para mandar la invitación '
  'como para revocarla si se filtra. El trigger de congelación de privilegios no '
  'estorba: esta función comprueba `puede_editar()` antes de tocar nada.';

create or replace function public.crear_grupo_invitacion(
  p_nombre               text,
  p_maximo_acompanantes  smallint default 0,
  p_lado                 public.lado_invitacion default 'ambos',
  p_invitado_a           public.evento_boda[] default array['ceremonia','banquete','fiesta']::public.evento_boda[]
)
returns table (grupo_id uuid, token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_grupo_id uuid;
  v_token    text;
begin
  if not public.puede_editar() then
    raise exception 'RSV06'
      using errcode = 'insufficient_privilege',
            hint    = 'Sólo un editor puede crear invitaciones.';
  end if;

  v_token := public.generar_token_invitacion();

  insert into public.grupos_invitacion (
    nombre, maximo_acompanantes, lado, invitado_a, huella_token, token_emitido_en
  )
  values (
    p_nombre, p_maximo_acompanantes, p_lado, p_invitado_a,
    public.huella_token(v_token), now()
  )
  returning id into v_grupo_id;

  return query select v_grupo_id, v_token;
end;
$$;

comment on function public.crear_grupo_invitacion(text, smallint, public.lado_invitacion, public.evento_boda[]) is
  'Crea un grupo y devuelve su enlace en un solo paso, que es lo que necesita el '
  'panel al dar de alta una familia. Sin esto habría que crear el grupo y rotar '
  'el token en dos llamadas, con una ventana en la que el grupo no tiene enlace.';


-- ----------------------------------------------------------------------------
-- 2. Cortafuegos de intentos
-- ----------------------------------------------------------------------------

create or replace function public.huella_peticion()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(split_part(
      coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''),
      ',', 1)), ''),
    'desconocido'
  );
$$;

comment on function public.huella_peticion() is
  'Origen aproximado de la petición, a partir de la cabecera que reenvía el proxy '
  'de Supabase. En un endpoint anónimo no hay identidad: esto es lo único con lo '
  'que se pueden contar intentos.';

create or replace function public.exigir_cupo_rsvp()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maximo   smallint;
  v_ventana  smallint;
  v_intentos bigint;
begin
  select s.maximo_intentos_rsvp, s.ventana_intentos_minutos
    into v_maximo, v_ventana
    from public.parametros_seguridad as s
   limit 1;

  -- Sin parámetros configurados se aplica el criterio conservador: cerrar.
  if v_maximo is null or v_ventana is null then
    raise exception 'RSV02'
      using errcode = 'insufficient_privilege',
            hint    = 'El servicio de confirmación no está disponible.';
  end if;

  select count(*)
    into v_intentos
    from public.intentos_rsvp as i
   where i.huella = public.huella_peticion()
     and not i.exito
     and i.creado_en > now() - make_interval(mins => v_ventana);

  if v_intentos >= v_maximo then
    raise exception 'RSV02'
      using errcode = 'insufficient_privilege',
            hint    = 'Demasiados intentos. Probad de nuevo dentro de un rato.';
  end if;
end;
$$;

comment on function public.exigir_cupo_rsvp() is
  'Corta el sondeo de tokens al azar contra /rsvp/[token]. Sólo cuentan los '
  'intentos FALLIDOS: una familia que abre su enlace veinte veces no se '
  'autobloquea.';

create or replace function public.registrar_intento_rsvp(p_token text, p_exito boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.intentos_rsvp (huella, huella_token, exito)
  values (public.huella_peticion(), public.huella_token(p_token), p_exito);
end;
$$;

comment on function public.registrar_intento_rsvp(text, boolean) is
  'Anota el intento. Guarda la huella del token, nunca el token: la bitácora de '
  'seguridad no puede convertirse en un almacén de credenciales.';


-- ----------------------------------------------------------------------------
-- 3. Resolver una invitación
-- ----------------------------------------------------------------------------

create or replace function public.obtener_invitacion(p_token text)
returns table (
  grupo_id             uuid,
  grupo_nombre         text,
  lado                 public.lado_invitacion,
  invitado_a           public.evento_boda[],
  maximo_acompanantes  smallint,
  acompanantes_usados  bigint,
  idioma               text,
  invitado_id          uuid,
  nombre               text,
  apellidos            text,
  es_nino              boolean,
  es_acompanante       boolean,
  tipo_menu            public.tipo_menu,
  alergias             text,
  estado               public.estado_confirmacion,
  respondido_en        timestamptz,
  necesita_autobus     boolean,
  necesita_alojamiento boolean,
  cancion_solicitada   text,
  mensaje              text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_grupo_id uuid;
begin
  perform public.exigir_cupo_rsvp();

  -- El token se resuelve por su huella. La tabla no contiene el secreto.
  select g.id into v_grupo_id
    from public.grupos_invitacion as g
   where g.huella_token = public.huella_token(p_token);

  -- RSV01: se anota el fallo y se devuelve vacío. Lanzar aquí borraría el propio
  -- registro del intento al abortar la transacción (ver cabecera del fichero).
  if v_grupo_id is null then
    perform public.registrar_intento_rsvp(p_token, false);
    return;
  end if;

  perform public.registrar_intento_rsvp(p_token, true);

  -- Tipo de retorno enumerado columna a columna. NO existe aquí `notas`, ni
  -- `huella_token`, ni la dirección postal de nadie más: lo que el invitado no
  -- debe ver, sencillamente no se selecciona.
  return query
    select
      g.id,
      g.nombre,
      g.lado,
      g.invitado_a,
      g.maximo_acompanantes,
      (select count(*) from public.invitados as a
        where a.grupo_id = g.id and a.es_acompanante),
      coalesce(g.idioma, c.idioma_por_defecto),
      i.id,
      i.nombre,
      i.apellidos,
      i.es_nino,
      i.es_acompanante,
      i.tipo_menu,
      i.alergias,
      f.estado,
      f.respondido_en,
      f.necesita_autobus,
      f.necesita_alojamiento,
      f.cancion_solicitada,
      f.mensaje
    from public.grupos_invitacion as g
    cross join lateral (
      select cb.idioma_por_defecto from public.configuracion_boda as cb limit 1
    ) as c
    join public.invitados as i on i.grupo_id = g.id
    left join public.confirmaciones as f
      on f.invitado_id = i.id and f.es_vigente
   where g.id = v_grupo_id
   order by i.es_acompanante, i.nombre_completo;
end;
$$;

comment on function public.obtener_invitacion(text) is
  'Única puerta de lectura del RSVP público. CERO FILAS significa enlace no '
  'válido: no lanza excepción, porque al abortar se perdería el registro del '
  'intento y el cortafuegos dejaría de contar. Devuelve el grupo del token y sus '
  'personas, con la respuesta vigente de cada una. El tipo de retorno se enumera '
  'a mano a propósito: con `returns setof public.invitados` el invitado recibiría '
  'también teléfonos, correos y notas privadas de sus coinvitados, y cualquier '
  'columna que se añadiera en el futuro se publicaría sola.';


-- ----------------------------------------------------------------------------
-- 4. Registrar la respuesta
-- ----------------------------------------------------------------------------

create or replace function public.registrar_confirmacion(p_token text, p_respuestas jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_grupo_id  uuid;
  v_insertadas integer;
  v_recibidas  integer;
begin
  perform public.exigir_cupo_rsvp();

  select g.id into v_grupo_id
    from public.grupos_invitacion as g
   where g.huella_token = public.huella_token(p_token);

  -- RSV01: 0 = enlace no válido. Una llamada legítima siempre registra al menos
  -- una respuesta (si no, se aborta con RSV04 más abajo), así que el 0 no es
  -- ambiguo.
  if v_grupo_id is null then
    perform public.registrar_intento_rsvp(p_token, false);
    return 0;
  end if;

  perform public.registrar_intento_rsvp(p_token, true);

  if jsonb_typeof(p_respuestas) <> 'array' then
    raise exception 'RSV04'
      using errcode = 'invalid_parameter_value',
            hint    = 'El formato de las respuestas no es válido.';
  end if;

  v_recibidas := jsonb_array_length(p_respuestas);

  -- Deja constancia del origen para la bitácora de auditoría: dentro de una
  -- función SECURITY DEFINER llamada con la clave anónima, `auth.uid()` es NULL
  -- y sin esto el cambio sería indistinguible de una migración.
  perform set_config('boda.origen_cambio', 'rsvp:' || v_grupo_id::text, true);

  -- El JOIN con `invitados` y `grupos_invitacion` es lo que ata cada respuesta
  -- al grupo del token, DENTRO de la misma sentencia que inserta. Un
  -- `invitado_id` de otro grupo no casa y no inserta nada: no hay ventana entre
  -- comprobar y escribir, ni forma de degradar la confirmación de un tercero.
  with entrada as (
    select
      (r ->> 'invitado_id')::uuid                          as invitado_id,
      (r ->> 'estado')::public.estado_confirmacion         as estado,
      -- Una casilla que el navegador no envía significa «no marcada», es decir
      -- «no», no «no lo sé». Sin este coalesce llegaría NULL y la restricción
      -- `confirmaciones_logistica_completa` abortaría la confirmación entera con
      -- un 23514 en la cara del invitado, sin nada que él pudiera hacer para
      -- arreglarlo. Sólo se normaliza cuando la respuesta es `confirmado`: quien
      -- no viene no tiene por qué opinar sobre el autobús, y ahí el NULL es el
      -- valor correcto.
      case when (r ->> 'estado') = 'confirmado'
           then coalesce((r ->> 'necesita_autobus')::boolean, false)
           else (r ->> 'necesita_autobus')::boolean end     as necesita_autobus,
      case when (r ->> 'estado') = 'confirmado'
           then coalesce((r ->> 'necesita_alojamiento')::boolean, false)
           else (r ->> 'necesita_alojamiento')::boolean end as necesita_alojamiento,
      nullif(btrim(r ->> 'cancion_solicitada'), '')        as cancion_solicitada,
      nullif(btrim(r ->> 'mensaje'), '')                   as mensaje
    from jsonb_array_elements(p_respuestas) as r
  )
  insert into public.confirmaciones (
    invitado_id, estado, origen, respondido_en,
    necesita_autobus, necesita_alojamiento, cancion_solicitada, mensaje,
    registrado_por
  )
  select
    i.id,
    e.estado,
    'publico',      -- fijado por el servidor, jamás leído de la petición
    now(),          -- idem: el invitado no fecha su propia respuesta
    e.necesita_autobus,
    e.necesita_alojamiento,
    e.cancion_solicitada,
    e.mensaje,
    null            -- una respuesta pública no tiene autor del panel
  from entrada as e
  join public.invitados as i
    on i.id = e.invitado_id
   and i.grupo_id = v_grupo_id;

  get diagnostics v_insertadas = row_count;

  -- Si alguna respuesta no cuajó, o sobra o era de otro grupo. En ambos casos se
  -- deshace todo: una confirmación a medias es peor que ninguna.
  if v_insertadas <> v_recibidas then
    raise exception 'RSV04'
      using errcode = 'insufficient_privilege',
            detail  = format('grupo=%s recibidas=%s insertadas=%s',
                             v_grupo_id, v_recibidas, v_insertadas),
            hint    = 'Alguna de las personas no pertenece a esta invitación.';
  end if;

  return v_insertadas;
end;
$$;

comment on function public.registrar_confirmacion(text, jsonb) is
  'Única puerta de escritura del RSVP público. Devuelve cuántas respuestas ha '
  'registrado; 0 significa enlace no válido. El plazo lo aplica el trigger '
  '`confirmaciones_validar_plazo` contra `now()`; el origen, la fecha de respuesta '
  'y la autoría los fija esta función y no la petición; y la pertenencia al grupo '
  'se resuelve en el propio INSERT. Si el número de filas insertadas no coincide '
  'con el de respuestas recibidas, la transacción entera se deshace.';


-- ----------------------------------------------------------------------------
-- 5. Añadir un acompañante
--    El tope lo garantiza el constraint trigger `invitados_aforo_grupo`, que
--    bloquea la fila del grupo: treinta llamadas concurrentes no pueden colar
--    treinta acompañantes en un grupo que sólo admite uno.
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


-- ----------------------------------------------------------------------------
-- 6. Purga de la bitácora de intentos
-- ----------------------------------------------------------------------------

create or replace function public.purgar_intentos_rsvp()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_dias     smallint;
  v_borradas integer;
begin
  select s.dias_retencion_intentos into v_dias
    from public.parametros_seguridad as s
   limit 1;

  delete from public.intentos_rsvp
   where creado_en < now() - make_interval(days => coalesce(v_dias, 30));

  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

comment on function public.purgar_intentos_rsvp() is
  'Limpia los intentos antiguos. Se programa con pg_cron; el periodo de retención '
  'es configuración (`parametros_seguridad.dias_retencion_intentos`), no un '
  'literal dentro de la función.';


-- ----------------------------------------------------------------------------
-- 7. Privilegios
--    Sólo tres funciones son públicas. Todo lo demás queda cerrado, y se cierra
--    nombrando a `anon` y `authenticated`: `revoke ... from public` NO les quita
--    nada, porque su EXECUTE viene de un GRANT explícito de Supabase y no del
--    pseudo-rol PUBLIC.
-- ----------------------------------------------------------------------------

revoke execute on function public.rotar_token_invitacion(uuid)                      from public, anon, authenticated;
revoke execute on function public.crear_grupo_invitacion(text, smallint, public.lado_invitacion, public.evento_boda[]) from public, anon, authenticated;
revoke execute on function public.huella_peticion()                                 from public, anon, authenticated;
revoke execute on function public.exigir_cupo_rsvp()                                from public, anon, authenticated;
revoke execute on function public.registrar_intento_rsvp(text, boolean)             from public, anon, authenticated;
revoke execute on function public.purgar_intentos_rsvp()                            from public, anon, authenticated;
revoke execute on function public.obtener_invitacion(text)                          from public, anon, authenticated;
revoke execute on function public.registrar_confirmacion(text, jsonb)               from public, anon, authenticated;
revoke execute on function public.anadir_acompanante(text, text, text, boolean, public.tipo_menu, text) from public, anon, authenticated;

-- Las tres puertas públicas del RSVP, y ninguna más.
grant execute on function public.obtener_invitacion(text)             to anon, authenticated;
grant execute on function public.registrar_confirmacion(text, jsonb)  to anon, authenticated;
grant execute on function public.anadir_acompanante(text, text, text, boolean, public.tipo_menu, text) to anon, authenticated;

-- La emisión de enlaces la usa el panel.
grant execute on function public.rotar_token_invitacion(uuid) to authenticated;
grant execute on function public.crear_grupo_invitacion(text, smallint, public.lado_invitacion, public.evento_boda[]) to authenticated;

commit;

-- ============================================================================
-- NOTAS DE OPERACIÓN (no son SQL de esta migración, pero sin ellas no cierra)
-- ----------------------------------------------------------------------------
-- 1. Programar la purga:
--      select cron.schedule('purgar-intentos-rsvp', '30 4 * * *',
--                           'select public.purgar_intentos_rsvp()');
-- 2. La clave `service_role` tiene BYPASSRLS y anula todo este fichero de una
--    sola vez: nunca puede aparecer en código de cliente ni en una variable de
--    entorno con prefijo público (`NEXT_PUBLIC_*`).
-- 3. El registro público de Supabase puede quedarse activado sin riesgo: un alta
--    nueva crea un perfil INACTIVO salvo que el correo esté en
--    `invitaciones_panel`, y todas las funciones de rol exigen `activo`. La
--    seguridad está en la base de datos, no en una casilla del panel.
-- ============================================================================
