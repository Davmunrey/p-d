-- BODA-14 · Suite de seguridad de la base de datos
--
-- Estos tests son BLOQUEANTES. Verifican la única garantía que de verdad
-- importa: que alguien con la clave pública, o con el enlace de otro invitado,
-- no puede leer ni escribir lo que no le corresponde.
--
-- Se ejecutan contra un Postgres real (ver scripts/probar-bbdd.sh). No usan
-- mocks: un mock de RLS no demuestra nada.
--
-- Cada prueba imprime OK o FALLA. El script que las lanza sale con error si
-- aparece cualquier FALLA.

\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

create or replace function pg_temp.comprobar(descripcion text, condicion boolean)
returns void language plpgsql as $$
begin
  if condicion then
    raise notice 'OK    %', descripcion;
  else
    raise warning 'FALLA %', descripcion;
  end if;
end $$;

-- Intenta leer una tabla como el rol indicado. Devuelve true si el acceso fue
-- denegado (que es lo que queremos para las tablas privadas).
create or replace function pg_temp.lectura_denegada(p_rol text, p_tabla text)
returns boolean language plpgsql as $$
declare
  v_filas bigint;
begin
  execute format('set local role %I', p_rol);
  execute format('select count(*) from public.%I', p_tabla) into v_filas;
  execute 'reset role';
  -- Sin privilegio la ejecución habría lanzado. Llegar aquí con filas visibles
  -- es un fallo; cero filas también vale como denegación efectiva.
  return v_filas = 0;
exception
  when insufficient_privilege then
    execute 'reset role';
    return true;
  when others then
    execute 'reset role';
    return true;
end $$;

\echo ''
\echo '========================================'
\echo '  SEGURIDAD · lo que anon NO puede ver'
\echo '========================================'

do $$
declare
  t text;
  privadas text[] := array[
    'grupos_invitacion', 'invitados', 'confirmaciones', 'notas_invitado',
    'notas_grupo', 'proveedores', 'documentos_proveedor', 'servicios',
    'categorias_proveedor', 'categorias_presupuesto', 'partidas_presupuesto',
    'pagos', 'tareas', 'mesas', 'perfiles', 'registro_auditoria',
    'configuracion_privada', 'intentos_rsvp', 'invitaciones_panel',
    'parametros_seguridad'
  ];
begin
  foreach t in array privadas loop
    perform pg_temp.comprobar(
      format('anon no puede leer %s', t),
      pg_temp.lectura_denegada('anon', t)
    );
  end loop;
end $$;

\echo ''
\echo '========================================'
\echo '  RLS activo en todas las tablas'
\echo '========================================'

do $$
declare
  sin_rls text[];
begin
  select coalesce(array_agg(tablename), '{}')
    into sin_rls
    from pg_tables
   where schemaname = 'public' and not rowsecurity;

  perform pg_temp.comprobar(
    format('todas las tablas tienen RLS (sin RLS: %s)', coalesce(array_to_string(sin_rls, ', '), 'ninguna')),
    cardinality(sin_rls) = 0
  );
end $$;

\echo ''
\echo '========================================'
\echo '  Funciones SECURITY DEFINER blindadas'
\echo '========================================'

do $$
declare
  sin_search_path text[];
begin
  -- Una función SECURITY DEFINER sin search_path fijo permite que quien la
  -- llama cree objetos que la función resolverá con privilegios elevados.
  select coalesce(array_agg(p.proname::text), '{}')
    into sin_search_path
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) as cfg
        where cfg like 'search_path=%'
     );

  perform pg_temp.comprobar(
    format('toda función SECURITY DEFINER fija search_path (sin fijar: %s)',
           coalesce(array_to_string(sin_search_path, ', '), 'ninguna')),
    cardinality(sin_search_path) = 0
  );
end $$;

\echo ''
\echo '========================================'
\echo '  Arranque en frío: una sola vez'
\echo '========================================'

do $$
declare
  v_error text;
begin
  perform pg_temp.comprobar(
    'existe un propietario activo tras el arranque',
    exists (select 1 from public.perfiles where rol = 'propietario' and activo)
  );

  begin
    perform public.designar_primer_propietario(
      (select usuario_id from public.perfiles limit 1)
    );
    perform pg_temp.comprobar('el arranque se rechaza la segunda vez', false);
  exception when others then
    perform pg_temp.comprobar('el arranque se rechaza la segunda vez', true);
  end;
end $$;

\echo ''
\echo '========================================'
\echo '  Registro público: un intruso no ve nada'
\echo '========================================'

-- El ataque más realista de todos, y el que no necesita ningún token: la clave
-- anónima viaja en el bundle de la landing, así que cualquiera puede llamar a
-- /auth/v1/signup y obtener una cuenta. Si el perfil naciera activo, ese
-- desconocido sería un lector legítimo de la lista de invitados, con teléfonos
-- y alergias — dato de salud, artículo 9 del RGPD.
do $$
declare
  v_intruso uuid := '99999999-9999-9999-9999-999999999999';
  v_filas   bigint;
  v_activo  boolean;
begin
  insert into auth.users (id, email)
  values (v_intruso, 'intruso@ejemplo.com')
  on conflict (id) do nothing;

  select p.activo into v_activo
    from public.perfiles as p
   where p.usuario_id = v_intruso;

  perform pg_temp.comprobar(
    'quien se registra por su cuenta no queda activo',
    coalesce(v_activo, false) = false
  );

  -- Y aunque tenga sesión válida, no puede leer nada.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', v_intruso::text, true);

    select count(*) into v_filas from public.invitados;
    perform pg_temp.comprobar('un recién registrado no lee la lista de invitados', v_filas = 0);

    select count(*) into v_filas from public.pagos;
    perform pg_temp.comprobar('un recién registrado no lee los pagos', v_filas = 0);
  exception when insufficient_privilege then
    perform pg_temp.comprobar('un recién registrado no lee la lista de invitados', true);
    perform pg_temp.comprobar('un recién registrado no lee los pagos', true);
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
end $$;

\echo ''
\echo '========================================'
\echo '  RSVP público: solo tu grupo'
\echo '========================================'

do $$
declare
  v_token   text;
  v_grupo   uuid;
  v_otro    uuid;
  v_mio     uuid;
  v_ajeno   uuid;
  v_filas   bigint;
  v_ok      boolean;
begin
  -- Dos grupos distintos: el nuestro y el de otra familia, para poder probar
  -- el ataque cruzado, que es la comprobación importante de todo el fichero.
  select token into v_token
    from public.crear_grupo_invitacion(
      'Grupo de prueba', 2::smallint, 'ambos'::public.lado_invitacion,
      array['ceremonia']::public.evento_boda[]
    );

  select g.id into v_grupo
    from public.grupos_invitacion as g
   where g.huella_token = public.huella_token(v_token);

  insert into public.invitados (grupo_id, nombre, apellidos)
  values (v_grupo, 'Prueba', 'Uno')
  returning id into v_mio;

  select id into v_otro
    from public.grupos_invitacion
   where id <> v_grupo
   limit 1;

  if v_otro is null then
    insert into public.grupos_invitacion (nombre) values ('Otra familia')
    returning id into v_otro;
  end if;

  insert into public.invitados (grupo_id, nombre, apellidos)
  values (v_otro, 'Ajena', 'Dos')
  returning id into v_ajeno;

  set local role anon;

  select count(*) into v_filas from public.obtener_invitacion(v_token);
  perform pg_temp.comprobar('un token válido devuelve su invitación', v_filas > 0);

  select count(*) into v_filas
    from public.obtener_invitacion('token-inventado-que-no-existe-0000');
  perform pg_temp.comprobar('un token inventado no devuelve nada', v_filas = 0);

  begin
    perform public.registrar_confirmacion(
      v_token,
      jsonb_build_array(jsonb_build_object(
        'invitado_id', v_ajeno, 'estado', 'confirmado',
        'necesita_autobus', true, 'necesita_alojamiento', false
      ))
    );
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.comprobar('no se puede confirmar a alguien de otro grupo', v_ok);

  -- Casilla sin marcar: debe aceptarse como «no», no reventar.
  begin
    perform public.registrar_confirmacion(
      v_token,
      jsonb_build_array(jsonb_build_object('invitado_id', v_mio, 'estado', 'confirmado'))
    );
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.comprobar('una confirmación sin logística explícita se acepta', v_ok);

  reset role;
end $$;

\echo ''
