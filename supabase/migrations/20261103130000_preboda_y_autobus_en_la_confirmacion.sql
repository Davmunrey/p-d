-- ============================================================================
-- La preboda y el trayecto del autobús, en la confirmación
--
-- Dos preguntas nuevas del paso de detalles, a cada persona que viene:
--
--   · SI VIENE TAMBIÉN A LA PREBODA (`asiste_preboda`).
--   · QUÉ AUTOBÚS NECESITA (`trayecto_autobus`): ninguno, sólo ida, sólo
--     vuelta, o ida y vuelta. «Necesita autobús» a secas no servía para
--     contratar: hacen falta las plazas de ida y las de vuelta, que no son las
--     mismas —quien se queda a dormir en la finca no vuelve; quien llega en su
--     coche y bebe, sí—.
--
-- Quien viene a la boda dice también si viene a la preboda de la víspera. Se
-- pregunta en el paso de detalles, junto al menú y el autobús, a cada persona
-- que viene: quien no viene a la boda no marca la preboda.
--
-- NULL ES «NO SE LE PREGUNTÓ», no «no». Sin preboda en la web la casilla no
-- sale, y una respuesta de antes de esta migración tampoco la tuvo delante:
-- contarlas como «no» daría un recuento de preboda falso. Así que sólo
-- `true` suma, y sólo quien viene a la boda puede tenerlo.
--
-- EL SÍ/NO DEL AUTOBÚS SE QUEDA, DERIVADO. `necesita_autobus` lo leen el
-- guion del día, las mesas, los servicios y la restricción de logística
-- completa; un disparador lo calcula del trayecto al insertar, así que todo lo
-- que ya lo usaba sigue diciendo lo mismo. Las respuestas de antes no se
-- convierten —`confirmaciones` es un histórico inmutable—: un «sí» antiguo
-- cuenta como ida y vuelta, que es lo que significaba.
--
-- Toca las piezas de la confirmación: las columnas, la puerta de lectura
-- (`obtener_invitacion`, que las devuelve para sembrar el formulario), la de
-- escritura (`registrar_confirmacion`, que las guarda) y el recuento del panel
-- (`v_estadisticas_invitados`, que las cuenta).
--
-- Rollback: supabase/migrations/rollback/20261103130000_preboda_y_autobus_en_la_confirmacion.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. La columna
-- ---------------------------------------------------------------------------

alter table public.confirmaciones
  add column if not exists asiste_preboda boolean;

alter table public.confirmaciones
  drop constraint if exists confirmaciones_preboda_solo_si_viene;

alter table public.confirmaciones
  add constraint confirmaciones_preboda_solo_si_viene
    check (asiste_preboda is not true or estado = 'confirmado');

comment on column public.confirmaciones.asiste_preboda is
  'Si quien viene a la boda viene también a la preboda de la víspera. NULL es '
  '«no se le preguntó» (no había preboda en la web, o respondió antes de que '
  'existiera la pregunta), no «no». Sólo puede ser true si viene a la boda.';

-- ---------------------------------------------------------------------------
-- 1 bis. El trayecto del autobús
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'trayecto_autobus'
                 and typnamespace = 'public'::regnamespace) then
    create type public.trayecto_autobus as enum ('ninguno', 'ida', 'vuelta', 'ida_y_vuelta');
  end if;
end $$;

comment on type public.trayecto_autobus is
  'Qué autobús necesita quien viene: ninguno, sólo ida, sólo vuelta, o ida y vuelta.';

alter table public.confirmaciones
  add column if not exists trayecto_autobus public.trayecto_autobus;

alter table public.confirmaciones
  drop constraint if exists confirmaciones_trayecto_solo_si_viene;

alter table public.confirmaciones
  add constraint confirmaciones_trayecto_solo_si_viene
    check (trayecto_autobus is null or estado = 'confirmado');

comment on column public.confirmaciones.trayecto_autobus is
  'Qué autobús necesita quien viene. NULL en las respuestas de antes de que se '
  'preguntara el trayecto: ahí manda `necesita_autobus`, y un «sí» cuenta como '
  'ida y vuelta.';

/*
  `necesita_autobus` SALE DEL TRAYECTO cuando lo hay. Así no puede decir una
  cosa y el trayecto otra, y todo lo que ya leía el sí/no —el guion del día,
  las mesas, los servicios, `confirmaciones_logistica_completa`— sigue igual.
*/
create or replace function public.derivar_necesita_autobus()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.trayecto_autobus is not null then
    new.necesita_autobus := new.trayecto_autobus <> 'ninguno';
  end if;
  return new;
end;
$$;

comment on function public.derivar_necesita_autobus() is
  'Calcula `necesita_autobus` a partir de `trayecto_autobus` al insertar una '
  'respuesta, para que el sí/no y el trayecto no puedan contradecirse.';

revoke all on function public.derivar_necesita_autobus() from public, anon, authenticated;

drop trigger if exists confirmaciones_derivar_autobus on public.confirmaciones;
create trigger confirmaciones_derivar_autobus
  before insert on public.confirmaciones
  for each row execute function public.derivar_necesita_autobus();

-- ---------------------------------------------------------------------------
-- 2. La puerta de lectura: devuelve la respuesta para sembrar el formulario
-- ---------------------------------------------------------------------------

-- Cambia el tipo de retorno.
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
  necesita_autobus     boolean,
  asiste_preboda       boolean,
  trayecto_autobus     public.trayecto_autobus
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
      f.necesita_autobus,
      f.asiste_preboda,
      f.trayecto_autobus
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
  'respuesta vigente de cada una, preboda y trayecto del autobús incluidos. El tipo de retorno se '
  'enumera a mano a propósito: con `returns setof public.invitados` cualquier '
  'columna que se añadiera en el futuro se publicaría sola.';

revoke all on function public.obtener_invitacion(text) from public, anon, authenticated;
grant execute on function public.obtener_invitacion(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. La puerta de escritura: la guarda
-- ---------------------------------------------------------------------------

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
           else (r ->> 'necesita_autobus')::boolean end as necesita_autobus,
      -- El trayecto, sólo de quien viene. Si llega, `necesita_autobus` sale
      -- de él (disparador `confirmaciones_derivar_autobus`).
      case when (r ->> 'estado') = 'confirmado'
           then (r ->> 'trayecto_autobus')::public.trayecto_autobus
           else null end                               as trayecto_autobus,
      -- LA PREBODA NO SE NORMALIZA: la clave sólo viaja cuando la casilla
      -- estaba en el formulario. Ausente es «no se le preguntó» (NULL), y
      -- quien no viene a la boda no viene a la preboda, venga lo que venga.
      case when (r ->> 'estado') = 'confirmado'
           then (r ->> 'asiste_preboda')::boolean
           else null end                               as asiste_preboda
    from jsonb_array_elements(p_respuestas) as r
  )
  insert into public.confirmaciones (
    invitado_id, estado, origen, respondido_en, necesita_autobus, asiste_preboda,
    trayecto_autobus, registrado_por
  )
  select
    i.id,
    e.estado,
    'publico',      -- fijado por el servidor, jamás leído de la petición
    now(),          -- idem: el invitado no fecha su propia respuesta
    e.necesita_autobus,
    e.asiste_preboda,
    e.trayecto_autobus,
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
  'se deshace. Guarda la preboda y el trayecto del autobús sólo de quien viene; '
  'la preboda queda NULL si no se preguntó. '
  'Escribe además el menú y las alergias en `invitados`, que es donde viven; un '
  'menú infantil pedido para un adulto se ignora en lugar de abortar.';

revoke all on function public.registrar_confirmacion(text, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_confirmacion(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. El recuento del panel: la preboda, y las plazas de ida y de vuelta
-- ---------------------------------------------------------------------------
--
-- `create or replace` añade la columna al final sin tocar las demás ni los
-- permisos, y sin rehacer `v_servicios_importe`, que lee esta vista.

create or replace view public.v_estadisticas_invitados
with (security_invoker = on) as
select
  count(*)                                                   as personas,
  count(*) filter (where f.estado = 'confirmado')             as confirmados,
  count(*) filter (where f.estado = 'confirmado' and not i.es_nino) as adultos_confirmados,
  count(*) filter (where f.estado = 'confirmado' and i.es_nino)     as ninos_confirmados,
  count(*) filter (where f.estado = 'rechazado')              as rechazados,
  count(*) filter (where f.estado = 'tentativo')              as tentativos,
  count(*) filter (where f.estado = 'pendiente')              as pendientes,
  count(*) filter (where f.estado = 'confirmado' and f.necesita_autobus) as plazas_autobus,
  count(*) filter (where f.estado = 'confirmado' and f.asiste_preboda)   as asistentes_preboda,
  -- Un «sí» de antes del trayecto (NULL) cuenta en las dos: era ida y vuelta.
  count(*) filter (where f.estado = 'confirmado'
                     and (f.trayecto_autobus in ('ida', 'ida_y_vuelta')
                          or (f.trayecto_autobus is null and f.necesita_autobus))) as plazas_ida,
  count(*) filter (where f.estado = 'confirmado'
                     and (f.trayecto_autobus in ('vuelta', 'ida_y_vuelta')
                          or (f.trayecto_autobus is null and f.necesita_autobus))) as plazas_vuelta
from public.invitados as i
join public.confirmaciones as f
  on f.invitado_id = i.id and f.es_vigente;

commit;
