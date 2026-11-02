-- ============================================================================
-- Se vuelve a confirmar en la web, desde el enlace de cada invitación
--
-- Los novios cambian de idea: la confirmación vuelve a la web, al final de la
-- landing —se toca la estrella y se despliega el formulario, sin salir de la
-- página—, y sólo para quien entra por el enlace de su invitación. Vuelven las
-- dos puertas que usa el formulario, tal y como estaban en su última versión:
--
--   · `obtener_invitacion()`     — el grupo del enlace y sus personas, con la
--                                   respuesta vigente de cada una.
--   · `registrar_confirmacion()` — escribe la respuesta del grupo.
--
-- Con una diferencia en la primera: los aciertos ya no se anotan en
-- `intentos_rsvp`. Antes se abría sólo en la página del RSVP; ahora la lee la
-- landing en cada visita de quien tiene su enlace recordado, y la tabla no
-- tiene por qué crecer con cada visita. Los fallos sí se anotan y el cupo
-- sigue siendo el mismo (`exigir_cupo_rsvp()` sólo cuenta los fallos).
--
-- NO VUELVEN `anadir_acompanante()` ni `destinatarios_confirmacion()`: el
-- formulario no añade acompañantes y ya no hay acuse por correo. Una puerta
-- abierta que nadie usa es una puerta que alguien acaba probando.
--
-- `nombre_de_invitacion()` se queda: es la que usa el enlace al abrirse.
--
-- Rollback: supabase/migrations/rollback/20261102160000_confirmacion_en_la_web.sql
-- ============================================================================

-- obtener_invitacion() · de 20260803090500_funciones_publicas.sql

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

  -- Los aciertos no se anotan: no cuentan para el cupo, y esta puerta se abre
  -- en cada visita de quien entra con su enlace.

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

revoke all on function public.obtener_invitacion(text) from public, anon, authenticated;
grant execute on function public.obtener_invitacion(text) to anon, authenticated;

-- registrar_confirmacion() · de 20261002150000_cancion_corregida_sustituye_a_la_anterior.sql

create or replace function public.registrar_confirmacion(p_token text, p_respuestas jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_grupo_id   uuid;
  v_insertadas integer;
  v_recibidas  integer;
  v_antes      text[];
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

  -- LA CANCIÓN QUE EL GRUPO TENÍA PEDIDA HASTA AHORA. Se lee antes de insertar
  -- porque al insertar deja de ser la vigente. Va normalizada igual que el
  -- índice único de la playlist: «Bailando» y «bailando » son la misma.
  select coalesce(array_agg(distinct lower(btrim(c.cancion_solicitada))), '{}')
    into v_antes
    from public.confirmaciones as c
    join public.invitados as i on i.id = c.invitado_id
   where i.grupo_id = v_grupo_id
     and c.es_vigente
     and nullif(btrim(c.cancion_solicitada), '') is not null;

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

  -- ---------------------------------------------------------------------
  -- La canción corregida SUSTITUYE a la anterior en la playlist.
  --
  -- «Cambiar la respuesta» siembra el formulario con la canción vigente. Si el
  -- invitado la corrige —«Iglesas» por «Iglesias»— o la borra, la nueva se
  -- apunta después (`sugerir_cancion`, en su propia transacción), y la vieja
  -- se quedaba publicada para siempre: dos versiones en la portada, una plaza
  -- de las diez gastada y ninguna forma de quitar la mala desde fuera del
  -- panel. Se retira aquí, en la misma transacción que la respuesta que la
  -- deja de pedir, y sólo la del propio grupo.
  -- ---------------------------------------------------------------------
  delete from public.canciones_sugeridas as cs
   where cs.grupo_id = v_grupo_id
     and lower(btrim(cs.texto)) = any(v_antes)
     and not exists (
       select 1
         from jsonb_array_elements(p_respuestas) as r
        where lower(btrim(r ->> 'cancion_solicitada')) = lower(btrim(cs.texto))
     );

  -- ---------------------------------------------------------------------
  -- Menú y alergias. Van en `invitados` y no en `confirmaciones` porque son
  -- de la persona, no de la respuesta: quien es celíaco lo sigue siendo si
  -- cambia de opinión sobre si viene.
  --
  -- Mismo candado que arriba: el `where` ata la fila al grupo del token, así
  -- que un `invitado_id` ajeno no toca nada. Y sólo se escribe lo que venga:
  -- una clave ausente en el JSON deja el valor que ya había, en vez de borrar
  -- lo que el panel hubiera anotado a mano.
  -- ---------------------------------------------------------------------
  with declarado as (
    select
      (r ->> 'invitado_id')::uuid              as invitado_id,
      nullif(btrim(r ->> 'tipo_menu'), '')     as tipo_menu,
      r ? 'alergias'                           as trae_alergias,
      nullif(btrim(r ->> 'alergias'), '')      as alergias
    from jsonb_array_elements(p_respuestas) as r
  )
  update public.invitados as i
     set tipo_menu = case
           -- El menú infantil es sólo para menores. Si no lo es, se queda con
           -- el que tenía: abortar aquí tiraría la confirmación de todo el
           -- grupo por un desplegable mal elegido.
           when d.tipo_menu is null then i.tipo_menu
           when d.tipo_menu = 'infantil' and not i.es_nino then i.tipo_menu
           else d.tipo_menu::public.tipo_menu
         end,
         alergias = case when d.trae_alergias then d.alergias else i.alergias end,
         actualizado_en = now()
    from declarado as d
   where i.id = d.invitado_id
     and i.grupo_id = v_grupo_id;

  return v_insertadas;
end;
$$;

comment on function public.registrar_confirmacion(text, jsonb) is
  'Única puerta de escritura del RSVP público. Devuelve cuántas respuestas ha '
  'registrado; 0 significa enlace no válido. El plazo lo aplica el trigger '
  '`confirmaciones_validar_plazo` contra `now()`; el origen, la fecha de respuesta '
  'y la autoría los fija esta función y no la petición; y la pertenencia al grupo '
  'se resuelve en el propio INSERT. Si el número de filas insertadas no coincide '
  'con el de respuestas recibidas, la transacción entera se deshace. Escribe '
  'además el menú y las alergias en `invitados`, que es donde viven: son de la '
  'persona y no de la respuesta. Un menú infantil pedido para un adulto se '
  'ignora en lugar de abortar, porque la restricción de la tabla se llevaría por '
  'delante la confirmación de todo el grupo. Si la canción del grupo cambia o '
  'se borra, la anterior sale de la playlist en la misma transacción.';

revoke all on function public.registrar_confirmacion(text, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_confirmacion(text, jsonb) to anon, authenticated;
