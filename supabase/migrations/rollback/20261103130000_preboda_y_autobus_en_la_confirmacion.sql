-- Rollback de 20261103130000_preboda_y_autobus_en_la_confirmacion.sql
--
-- Vuelven las dos puertas de la confirmación y el recuento del panel tal como
-- estaban (copiados de 20261102200000 y 20261102190000), y después se va la
-- preboda y el trayecto del autobús, y con ellos lo que cada uno contestó.
-- El sí/no del autobús se queda, como estaba antes.
--
-- La vista no deja quitar una columna con `replace`, así que se rehace; y como
-- `v_servicios_importe` la lee, se rehace con ella, idéntica.
begin;

drop function if exists public.obtener_invitacion(text);

create function public.obtener_invitacion(p_token text)
returns table (
  grupo_nombre         text,
  maximo_acompanantes  smallint,
  acompanantes_usados  bigint,
  invitado_id          uuid,
  nombre               text,
  apellidos            text,
  es_nino              boolean,
  es_acompanante       boolean,
  tipo_menu            public.tipo_menu,
  alergias             text,
  estado               public.estado_confirmacion,
  respondido_en        timestamptz,
  necesita_autobus     boolean
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

  -- RSV01: se anota el fallo y se devuelve vacío. Lanzar aquí borraría el
  -- propio registro del intento al abortar la transacción.
  if v_grupo_id is null then
    perform public.registrar_intento_rsvp(p_token, false);
    return;
  end if;

  -- Los aciertos no se anotan: no cuentan para el cupo, y esta puerta se abre
  -- en cada visita de quien entra con su enlace.

  -- Tipo de retorno enumerado columna a columna, y sólo lo que pinta el
  -- formulario: ni `huella_token`, ni ids del grupo, ni nada que el invitado
  -- no necesite ver.
  return query
    select
      g.nombre,
      g.maximo_acompanantes,
      (select count(*) from public.invitados as a
        where a.grupo_id = g.id and a.es_acompanante),
      i.id,
      i.nombre,
      i.apellidos,
      i.es_nino,
      i.es_acompanante,
      i.tipo_menu,
      i.alergias,
      f.estado,
      f.respondido_en,
      f.necesita_autobus
    from public.grupos_invitacion as g
    join public.invitados as i on i.grupo_id = g.id
    left join public.confirmaciones as f
      on f.invitado_id = i.id and f.es_vigente
   where g.id = v_grupo_id
   order by i.es_acompanante, i.nombre_completo;
end;
$$;

comment on function public.obtener_invitacion(text) is
  'Única puerta de lectura del formulario de confirmación. CERO FILAS significa '
  'enlace no válido: no lanza excepción, porque al abortar se perdería el '
  'registro del intento y el cortafuegos dejaría de contar. Devuelve el grupo '
  'del token —su nombre y cuántos acompañantes caben— y sus personas, con la '
  'respuesta vigente de cada una. El tipo de retorno se enumera a mano a '
  'propósito: con `returns setof public.invitados` cualquier columna que se '
  'añadiera en el futuro se publicaría sola.';

revoke all on function public.obtener_invitacion(text) from public, anon, authenticated;
grant execute on function public.obtener_invitacion(text) to anon, authenticated;

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

  -- El JOIN con `invitados` es lo que ata cada respuesta al grupo del token,
  -- DENTRO de la misma sentencia que inserta. Un `invitado_id` de otro grupo no
  -- casa y no inserta nada: no hay ventana entre comprobar y escribir, ni forma
  -- de degradar la confirmación de un tercero.
  with entrada as (
    select
      (r ->> 'invitado_id')::uuid                      as invitado_id,
      (r ->> 'estado')::public.estado_confirmacion     as estado,
      -- Una casilla que el navegador no envía significa «no marcada», es decir
      -- «no», no «no lo sé». Sólo se normaliza cuando la respuesta es
      -- `confirmado`: quien no viene no opina sobre el autobús.
      case when (r ->> 'estado') = 'confirmado'
           then coalesce((r ->> 'necesita_autobus')::boolean, false)
           else (r ->> 'necesita_autobus')::boolean end as necesita_autobus
    from jsonb_array_elements(p_respuestas) as r
  )
  insert into public.confirmaciones (
    invitado_id, estado, origen, respondido_en, necesita_autobus, registrado_por
  )
  select
    i.id,
    e.estado,
    'publico',      -- fijado por el servidor, jamás leído de la petición
    now(),          -- idem: el invitado no fecha su propia respuesta
    e.necesita_autobus,
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

  -- Menú y alergias. Van en `invitados` y no en `confirmaciones` porque son de
  -- la persona, no de la respuesta. Mismo candado: el `where` ata la fila al
  -- grupo del token. Y sólo se escribe lo que venga: una clave ausente deja el
  -- valor que ya había, en vez de borrar lo que el panel hubiera anotado.
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
  'Única puerta de escritura del formulario de confirmación. Devuelve cuántas '
  'respuestas ha registrado; 0 significa enlace no válido. El plazo lo aplica el '
  'trigger `confirmaciones_validar_plazo` contra `now()`; el origen, la fecha de '
  'respuesta y la autoría los fija esta función y no la petición; y la '
  'pertenencia al grupo se resuelve en el propio INSERT. Si el número de filas '
  'insertadas no coincide con el de respuestas recibidas, la transacción entera '
  'se deshace. Escribe además el menú y las alergias en `invitados`, que es donde '
  'viven; un menú infantil pedido para un adulto se ignora en lugar de abortar.';

revoke all on function public.registrar_confirmacion(text, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_confirmacion(text, jsonb) to anon, authenticated;

drop view if exists public.v_servicios_importe;
drop view if exists public.v_estadisticas_invitados;

create view public.v_estadisticas_invitados
with (security_invoker = on) as
select
  count(*)                                                   as personas,
  count(*) filter (where f.estado = 'confirmado')             as confirmados,
  count(*) filter (where f.estado = 'confirmado' and not i.es_nino) as adultos_confirmados,
  count(*) filter (where f.estado = 'confirmado' and i.es_nino)     as ninos_confirmados,
  count(*) filter (where f.estado = 'rechazado')              as rechazados,
  count(*) filter (where f.estado = 'tentativo')              as tentativos,
  count(*) filter (where f.estado = 'pendiente')              as pendientes,
  count(*) filter (where f.estado = 'confirmado' and f.necesita_autobus) as plazas_autobus
from public.invitados as i
join public.confirmaciones as f
  on f.invitado_id = i.id and f.es_vigente;

comment on view public.v_estadisticas_invitados is
  'Recuento del panel en una sola fila. El JOIN es limpio, sin COALESCE ni LEFT '
  'JOIN, porque todo invitado tiene siempre una confirmación vigente: lo garantiza '
  '`invitados_confirmacion_inicial` al darlo de alta y '
  '`confirmaciones_siempre_vigente` a partir de entonces.';

create view public.v_servicios_importe
with (security_invoker = on) as
select
  s.id,
  s.proveedor_id,
  s.nombre,
  s.descripcion,
  s.precio_unitario,
  s.cantidad,
  s.por_invitado,
  s.importe_fijo,
  case
    when s.por_invitado then greatest(
      s.precio_unitario * s.cantidad
        * coalesce((
            select case s.base_calculo
              when 'adultos' then e.adultos_confirmados
              when 'ninos'   then e.ninos_confirmados
              else                e.confirmados
            end
            from public.v_estadisticas_invitados as e
          ), 0),
      coalesce(s.minimo_garantizado, 0)
    )
    else s.importe_fijo
  end as importe_total,
  s.base_calculo,
  s.minimo_garantizado,
  case
    when s.por_invitado then
      s.precio_unitario * s.cantidad
        * coalesce((
            select case s.base_calculo
              when 'adultos' then e.adultos_confirmados
              when 'ninos'   then e.ninos_confirmados
              else                e.confirmados
            end
            from public.v_estadisticas_invitados as e
          ), 0)
    else s.importe_fijo
  end as importe_calculado
from public.servicios as s;

comment on view public.v_servicios_importe is
  'Importe real de cada servicio, resolviendo aquí —y no en el frontend— los '
  'de precio por invitado: confirmados según `base_calculo`, y nunca por '
  'debajo de `minimo_garantizado`. `importe_calculado` es la cuenta sin el '
  'mínimo, para poder enseñar la diferencia. Confirmar un invitado recalcula '
  'todo esto solo, porque no hay nada que recalcular: es una vista.';

-- Los mismos permisos que tenían: sólo el panel, nunca la clave anónima.
revoke all on public.v_estadisticas_invitados, public.v_servicios_importe from public, anon;
grant select on public.v_estadisticas_invitados, public.v_servicios_importe to authenticated;

drop trigger if exists confirmaciones_derivar_autobus on public.confirmaciones;
drop function if exists public.derivar_necesita_autobus();

alter table public.confirmaciones
  drop constraint if exists confirmaciones_preboda_solo_si_viene,
  drop constraint if exists confirmaciones_trayecto_solo_si_viene,
  drop column if exists asiste_preboda,
  drop column if exists trayecto_autobus;

drop type if exists public.trayecto_autobus;

commit;
