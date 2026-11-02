-- ============================================================================
-- Fuera lo que nadie usa
--
-- Segunda pasada sobre el esquema, después de `20261102190000`. Lo que se va
-- no lo escribe ni lo lee ninguna pantalla, y en producción no tiene datos:
--
--   · LOS EVENTOS DE CADA INVITACIÓN (`grupos_invitacion.invitado_a` y su
--     enumerado `evento_boda`). Se pensó para invitar a alguien sólo a la
--     ceremonia o sólo a la fiesta, pero el panel nunca lo pidió —todas las
--     invitaciones nacían con los tres— y la web no filtra nada por él. Con
--     la columna se van su trigger de normalización y su índice, y deja de
--     ser uno de los «privilegios» congelados del grupo.
--   · EL IDIOMA DE CADA INVITACIÓN (`grupos_invitacion.idioma`). La boda es
--     sólo en castellano. El idioma de la boda sigue en
--     `configuracion_boda.idioma_por_defecto`, que es el que exige el texto
--     alternativo de las fotos.
--   · LAS NOTAS PRIVADAS (`notas_grupo`, `notas_invitado` y
--     `configuracion_privada.notas_privadas`), y EL PRESUPUESTO OBJETIVO Y EL
--     AFORO de `configuracion_privada`: ninguna pantalla los escribía ni los
--     enseñaba.
--   · `invitaciones_panel.invitado_por`: nada lo rellenaba nunca.
--   · Y TRES TABLAS QUE NO SON DE ESTE PROYECTO: `users`, `posts` y
--     `comments`, el blog de ejemplo de Supabase (`example.com`, «Welcome to
--     Our Blog»), que apareció en la base de producción el 14 de septiembre
--     sin ninguna migración detrás. El asesor de seguridad avisaba por ellas.
--
-- `crear_grupo_invitacion()` y `obtener_invitacion()` se rehacen sin lo que
-- se va. La segunda, además, deja de devolver `grupo_id` y `lado`, que el
-- formulario no usa: lo que el invitado no necesita, no se selecciona.
--
-- Rollback: supabase/migrations/rollback/20261102200000_fuera_lo_que_nadie_usa.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. El blog de ejemplo, que no es nuestro
-- ---------------------------------------------------------------------------

drop table if exists public.comments;
drop table if exists public.posts;
drop table if exists public.users;

-- ---------------------------------------------------------------------------
-- 2. Las funciones que nombran lo que se va (antes que las columnas y el tipo)
-- ---------------------------------------------------------------------------

create or replace function public.congelar_privilegios_grupo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.huella_token, new.maximo_acompanantes, new.lado)
     is distinct from
     (old.huella_token, old.maximo_acompanantes, old.lado)
     and not public.puede_editar()
  then
    raise exception 'RSV06'
      using errcode = 'insufficient_privilege',
            detail  = format('grupo=%s', old.id),
            hint    = 'Sólo un editor puede cambiar los privilegios de una invitación.';
  end if;

  return new;
end;
$$;

comment on function public.congelar_privilegios_grupo() is
  'Impide que el propio invitado se suba el cupo de acompañantes, se cambie de '
  'lado o reescriba su token dejando al grupo real fuera de su enlace. Dentro de '
  'las funciones públicas del RSVP `auth.uid()` es NULL, luego `puede_editar()` '
  'es falso y las tres columnas quedan congeladas.';

drop trigger if exists grupos_invitacion_normalizar_eventos on public.grupos_invitacion;
drop function if exists public.normalizar_eventos_grupo();

-- Cambia la firma: sin `p_invitado_a`.
drop function if exists public.crear_grupo_invitacion(text, smallint, public.lado_invitacion, public.evento_boda[]);

create function public.crear_grupo_invitacion(
  p_nombre              text,
  p_maximo_acompanantes smallint default 0,
  p_lado                public.lado_invitacion default 'ambos'
)
returns table (grupo_id uuid, token text)
language plpgsql
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
    nombre, maximo_acompanantes, lado, huella_token, token_emitido_en
  )
  values (
    p_nombre, p_maximo_acompanantes, p_lado,
    public.huella_token(v_token), now()
  )
  returning id into v_grupo_id;

  return query select v_grupo_id, v_token;
end;
$$;

comment on function public.crear_grupo_invitacion(text, smallint, public.lado_invitacion) is
  'Crea un grupo y devuelve su enlace en un solo paso, que es lo que necesita el '
  'panel al dar de alta una familia. Sin esto habría que crear el grupo y rotar '
  'el token en dos llamadas, con una ventana en la que el grupo no tiene enlace.';

revoke all on function public.crear_grupo_invitacion(text, smallint, public.lado_invitacion) from public, anon, authenticated;
grant execute on function public.crear_grupo_invitacion(text, smallint, public.lado_invitacion) to authenticated;

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

-- ---------------------------------------------------------------------------
-- 3. Las columnas y las tablas (sus CHECK e índices se van con ellas)
-- ---------------------------------------------------------------------------

alter table public.grupos_invitacion
  drop column if exists invitado_a,
  drop column if exists idioma;

drop type if exists public.evento_boda;

drop table if exists public.notas_invitado;
drop table if exists public.notas_grupo;

alter table public.configuracion_privada
  drop column if exists presupuesto_objetivo,
  drop column if exists aforo_maximo,
  drop column if exists notas_privadas;

alter table public.invitaciones_panel drop column if exists invitado_por;
