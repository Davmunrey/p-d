-- ============================================================================
-- BODA-55 · El RSVP guarda también el menú y las alergias
--
-- `registrar_confirmacion()` escribía la asistencia, el autobús, la canción y
-- el mensaje, pero no el menú ni las alergias — que no viven en
-- `confirmaciones` sino en `invitados`. Resultado: el formulario público podía
-- preguntar «¿vegano o sin gluten?» y tirar la respuesta a la basura sin que
-- nada fallara. Un campo que no persiste es peor que no tenerlo: la cocina
-- creería que no hay ni una alergia en toda la boda.
--
-- Se amplía la MISMA función en lugar de añadir una segunda puerta de
-- escritura. La comprobación de que cada persona pertenece al grupo del token
-- ya está resuelta aquí dentro, y duplicarla en otro sitio sólo añadiría un
-- segundo lugar donde equivocarse.
--
-- EL MENÚ INFANTIL SE IGNORA SI NO ES UN NIÑO. La tabla lo prohíbe con
-- `invitados_menu_infantil_solo_ninos`, y dejar que la restricción salte
-- abortaría la confirmación entera: un adulto que toca el menú equivocado
-- perdería la respuesta de todo su grupo sin entender por qué. Se queda con el
-- menú que ya tenía, que es la única salida que no castiga a nadie.
--
-- Rollback: supabase/migrations/rollback/20260810120000_rsvp_guarda_menu.sql
-- ============================================================================

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
  'delante la confirmación de todo el grupo.';
