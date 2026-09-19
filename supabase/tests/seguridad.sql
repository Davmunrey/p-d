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

-- Desde 20260919200000 una función nueva nace SIN execute para nadie —también
-- las temporales de esta suite—, y varios bloques la llaman siendo `anon` o
-- `authenticated`. Se concede a mano, que es justo la disciplina que esa
-- migración impone.
grant execute on function pg_temp.comprobar(text, boolean) to public;

-- Intenta leer una tabla como el rol indicado. Devuelve true si el acceso fue
-- denegado (que es lo que queremos para las tablas privadas).
--
-- CERO FILAS NO DEMUESTRA NADA, y aquí ponía que sí. La versión anterior daba
-- por denegada cualquier lectura que devolviera cero, así que una tabla VACÍA
-- salía OK aunque `anon` tuviera el `SELECT` y la política abierta de par en
-- par. Hoy ocho de las tablas privadas están vacías cuando esto corre: el test
-- bloqueante más importante de la suite era, para ellas, una comprobación que
-- no podía fallar.
--
-- Ahora se distinguen los dos motivos:
--   · sin privilegio  → denegado, y punto: no hace falta ninguna fila.
--   · con privilegio  → sólo lo puede estar parando RLS, y eso SÓLO se puede
--                       demostrar con datos delante. Sin filas se devuelve
--                       falso a propósito, para que salga rojo y quien conceda
--                       ese `SELECT` tenga que sembrar una fila con la que
--                       probarlo.
create or replace function pg_temp.lectura_denegada(p_rol text, p_tabla text)
returns boolean language plpgsql as $$
declare
  v_visibles bigint;
  v_reales   bigint;
begin
  if not has_table_privilege(p_rol, format('public.%I', p_tabla), 'SELECT') then
    return true;
  end if;

  -- Como superusuario: cuántas hay de verdad.
  execute format('select count(*) from public.%I', p_tabla) into v_reales;
  if v_reales = 0 then
    raise warning 'SIN DATOS: % tiene SELECT para % y está vacía, así que su denegación no se puede demostrar', p_tabla, p_rol;
    return false;
  end if;

  execute format('set local role %I', p_rol);
  execute format('select count(*) from public.%I', p_tabla) into v_visibles;
  execute 'reset role';

  return v_visibles = 0;
exception
  when insufficient_privilege then
    execute 'reset role';
    return true;
  when others then
    execute 'reset role';
    return true;
end $$;

grant execute on function pg_temp.lectura_denegada(text, text) to public;

\echo ''
\echo '========================================'
\echo '  SEGURIDAD · lo que anon NO puede ver'
\echo '========================================'

do $$
declare
  t text;
  privadas text[] := array[
    'grupos_invitacion', 'invitados', 'confirmaciones', 'notas_invitado',
    'notas_grupo', 'proveedores', 'documentos_proveedor', 'contactos_proveedor',
    'servicios', 'documentos_boda',
    'categorias_proveedor', 'categorias_presupuesto', 'partidas_presupuesto',
    'pagos', 'tareas', 'mesas', 'perfiles', 'registro_auditoria',
    'configuracion_privada', 'intentos_rsvp', 'invitaciones_panel',
    'parametros_seguridad',
    -- BODA-105: aquí dentro hay DNI y certificados de nacimiento.
    'documentos_boda',
    -- BODA-82/100/103: gestión interna; a un invitado no le incumbe nada.
    'plantilla_tareas', 'guion_dia', 'correcciones_recuento'
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
\echo '  BODA-127 · la invitación alcanza a la cuenta'
\echo '========================================'

-- Lo que este bloque defiende: que invitar a alguien valga TAMBIÉN cuando su
-- cuenta ya existe, sin que eso abra una vía para ascenderse a uno mismo.
--
-- Antes, `sincronizar_perfil_desde_auth()` miraba la lista sólo en el instante
-- del alta: registrarse un minuto antes de ser invitado dejaba el perfil
-- inactivo para siempre, y la puerta contestaba «el correo o la contraseña no
-- son correctos». Es lo que dejó fuera a los novios de su propio panel.

do $$
declare
  v_tarde  uuid := '0d1e2f30-0000-4000-8000-00000000d127';
  v_pronto uuid := '0d1e2f31-0000-4000-8000-00000000d127';
  v_suelto uuid := '0d1e2f32-0000-4000-8000-00000000d127';
  v_ok     boolean;
begin
  -- SIN SESIÓN, QUE ES COMO SE INSTALA. El guion que lanza esta suite deja
  -- puesto el testigo de un propietario para el resto de los bloques; con él
  -- puesto, el guardián deja pasar cualquier cosa y estas comprobaciones
  -- pasarían sin demostrar nada. Aquí se quita —acotado a esta transacción—
  -- para reproducir el editor SQL de Supabase, donde `auth.uid()` es null.
  perform set_config('request.jwt.claim.sub', '', true);

  delete from public.perfiles where usuario_id in (v_tarde, v_pronto, v_suelto);
  delete from auth.users where id in (v_tarde, v_pronto, v_suelto);
  delete from public.invitaciones_panel where correo_electronico like '%@boda127.test';

  -- 1. La cuenta primero, la invitación después: el caso que estaba roto.
  insert into auth.users (id, email) values (v_tarde, 'Tarde@Boda127.Test');

  perform pg_temp.comprobar(
    'sin invitación, el perfil nace inactivo',
    exists (select 1 from public.perfiles
             where usuario_id = v_tarde and not activo and rol = 'lector'));

  insert into public.invitaciones_panel (correo_electronico, rol)
  values ('tarde@boda127.test', 'propietario');

  perform pg_temp.comprobar(
    'invitar a quien YA tiene cuenta la activa con su rol',
    exists (select 1 from public.perfiles
             where usuario_id = v_tarde and activo and rol = 'propietario'));

  update public.invitaciones_panel set rol = 'editor'
   where correo_electronico = 'tarde@boda127.test';

  perform pg_temp.comprobar(
    'cambiar el rol en la lista alcanza al perfil ya creado',
    exists (select 1 from public.perfiles
             where usuario_id = v_tarde and activo and rol = 'editor'));

  -- 1 bis. LA CUENTA SIN PERFIL, que es el hueco que quedaba. El trigger del
  --         alta se traga sus errores a propósito —un fallo suyo no puede
  --         tumbar el registro de Supabase Auth— así que una cuenta sin fila en
  --         `perfiles` es posible, y contra ella el UPDATE de la invitación no
  --         hacía nada: ni error, ni cambio, ni rastro. Se borra el perfil para
  --         reproducirlo, que es el estado en que queda esa cuenta.
  delete from public.perfiles where usuario_id = v_tarde;

  perform pg_temp.comprobar(
    'el caso se reproduce: hay cuenta y no hay perfil',
    exists (select 1 from auth.users where id = v_tarde)
      and not exists (select 1 from public.perfiles where usuario_id = v_tarde));

  -- Volver a escribir la misma fila: es lo que hace quien intenta arreglarlo.
  update public.invitaciones_panel set rol = 'propietario'
   where correo_electronico = 'tarde@boda127.test';

  perform pg_temp.comprobar(
    'invitar a una cuenta SIN perfil se lo crea, activo y con su rol',
    exists (select 1 from public.perfiles
             where usuario_id = v_tarde and activo and rol = 'propietario'));

  -- 2. El orden de siempre sigue funcionando igual.
  insert into public.invitaciones_panel (correo_electronico, rol)
  values ('pronto@boda127.test', 'editor');
  insert into auth.users (id, email) values (v_pronto, 'pronto@boda127.test');

  perform pg_temp.comprobar(
    'invitar antes de crear la cuenta sigue funcionando',
    exists (select 1 from public.perfiles
             where usuario_id = v_pronto and activo and rol = 'editor'));

  -- 3. Y la puerta nueva no es una puerta: sólo deja pasar el cambio que pone
  --    el perfil de acuerdo con su invitación, y nada más.
  insert into auth.users (id, email) values (v_suelto, 'suelto@boda127.test');

  begin
    update public.perfiles set rol = 'propietario', activo = true
     where usuario_id = v_suelto;
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  perform pg_temp.comprobar('un ascenso sin invitación sigue lanzando PRF01', v_ok);

  begin
    update public.perfiles set rol = 'propietario'
     where usuario_id = v_pronto;
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  perform pg_temp.comprobar('un rol distinto al invitado sigue lanzando PRF01', v_ok);
end $$;

-- 4. LO QUE DE VERDAD IMPORTA: que un usuario con sesión no pueda usar su
--    propia invitación para reactivarse después de que le hayan quitado el
--    acceso. La política `perfiles_propio_actualizar` clava `rol` y `activo` en
--    su WITH CHECK, así que ni siquiera llega al trigger.
do $$
declare
  v_pronto uuid := '0d1e2f31-0000-4000-8000-00000000d127';
  v_ok     boolean;
  v_filas  integer;
begin
  perform set_config('request.jwt.claim.sub', '', true);

  -- Se le retira el acceso. Hace falta el testigo del arranque en frío porque
  -- desactivar desde una sesión de `psql` lo corta el propio guardián —
  -- `auth.uid()` es null ahí—, que es correcto y no es lo que mide este test:
  -- esto es la preparación del escenario, no lo que se comprueba.
  perform set_config('boda.arranque_en_curso', 'si', true);
  update public.perfiles set activo = false where usuario_id = v_pronto;
  perform set_config('boda.arranque_en_curso', 'no', true);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_pronto::text, true);

  begin
    update public.perfiles set activo = true where usuario_id = v_pronto;
    get diagnostics v_filas = row_count;
    v_ok := v_filas = 0;
  exception when others then
    v_ok := true;
  end;

  reset role;

  perform pg_temp.comprobar(
    'un usuario con sesión no se reactiva usando su invitación',
    v_ok and not exists (select 1 from public.perfiles
                          where usuario_id = v_pronto and activo));
end $$;

\echo ''
\echo '========================================'
\echo '  BODA-128 · reordenar secciones de la landing'
\echo '========================================'

-- Lo que este bloque defiende: que el panel pueda permutar dos secciones sin
-- chocar con la unicidad diferida de `orden`, y que sólo pueda hacerlo quien
-- tiene permiso para editar.
--
-- La función es SECURITY INVOKER a propósito: no eleva nada, decide
-- `secciones_landing_editor_actualizar`. Y comprueba las filas tocadas, porque
-- RLS no da error al prohibir una escritura — devuelve cero filas, y sin
-- mirarlo un lector pulsaba «subir» y la pantalla le decía «movida».

do $$
declare
  v_primera   public.seccion_landing;
  v_segunda   public.seccion_landing;
  v_orden_1   smallint;
  v_orden_2   smallint;
  v_ok        boolean;
begin
  select s.seccion, s.orden into v_primera, v_orden_1
    from public.secciones_landing as s order by s.orden asc limit 1;
  select s.seccion, s.orden into v_segunda, v_orden_2
    from public.secciones_landing as s order by s.orden asc offset 1 limit 1;

  perform public.reordenar_seccion_landing(v_primera, false);

  perform pg_temp.comprobar(
    'bajar la primera la permuta con la segunda',
    (select s.orden from public.secciones_landing as s where s.seccion = v_primera) = v_orden_2
    and (select s.orden from public.secciones_landing as s where s.seccion = v_segunda) = v_orden_1);

  -- Y de vuelta, que además prueba el sentido contrario.
  perform public.reordenar_seccion_landing(v_primera, true);

  perform pg_temp.comprobar(
    'subirla otra vez la devuelve a su sitio',
    (select s.orden from public.secciones_landing as s where s.seccion = v_primera) = v_orden_1);

  -- Subir la primera no es un error: es que no hay a dónde. La pantalla ya no
  -- pinta ese botón, pero el formulario se puede mandar a mano.
  begin
    perform public.reordenar_seccion_landing(v_primera, true);
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.comprobar('subir la primera no revienta, simplemente no hace nada', v_ok);

  perform pg_temp.comprobar(
    'y no ha cambiado nada al intentarlo',
    (select s.orden from public.secciones_landing as s where s.seccion = v_primera) = v_orden_1);
end $$;

-- UN LECTOR NO REORDENA. Se le da sesión de verdad —rol `authenticated` y su
-- identificador en el testigo— porque es la única forma de que RLS se aplique
-- como se aplica en producción.
do $$
declare
  v_lector  uuid := '0d1e2f40-0000-4000-8000-00000000d128';
  v_primera public.seccion_landing;
  v_orden   smallint;
  v_ok      boolean;
begin
  delete from public.perfiles where usuario_id = v_lector;
  delete from auth.users where id = v_lector;
  insert into auth.users (id, email) values (v_lector, 'lector@boda128.test');

  select s.seccion, s.orden into v_primera, v_orden
    from public.secciones_landing as s order by s.orden asc limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_lector::text, true);

  begin
    perform public.reordenar_seccion_landing(v_primera, false);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;

  reset role;

  perform pg_temp.comprobar('un lector no puede reordenar las secciones', v_ok);
  perform pg_temp.comprobar(
    'y el orden sigue exactamente igual',
    (select s.orden from public.secciones_landing as s where s.seccion = v_primera) = v_orden);
end $$;

-- Y `anon` no la puede ni llamar: esto es del panel.
do $$
declare
  v_primera public.seccion_landing;
  v_ok      boolean;
begin
  select s.seccion into v_primera
    from public.secciones_landing as s order by s.orden asc limit 1;

  set local role anon;
  begin
    perform public.reordenar_seccion_landing(v_primera, false);
    v_ok := false;
  exception when insufficient_privilege then
    v_ok := true;
  when others then
    v_ok := true;
  end;
  reset role;

  perform pg_temp.comprobar('anon no puede ejecutar reordenar_seccion_landing', v_ok);
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
\echo '  Contenido de la landing'
\echo '========================================'

-- Estas tablas SÍ las lee el público: son la web. Lo que hay que verificar es
-- lo contrario que en el resto — que se vea lo publicado y NO se vea el
-- borrador que todavía se está preparando.
do $$
declare
  v_visibles   bigint;
  v_ocultos    bigint;
  v_id         uuid;
begin
  insert into public.hitos_programa (hora, titulo, publicado)
  values ('13:00', 'Ceremonia de prueba', true);

  insert into public.hitos_programa (hora, titulo, publicado)
  values ('99:99', 'Borrador que no debe verse', false)
  returning id into v_id;

  set local role anon;

  select count(*) into v_visibles from public.hitos_programa;
  perform pg_temp.comprobar('anon lee el programa publicado', v_visibles > 0);

  select count(*) into v_ocultos
    from public.hitos_programa as h
   where h.id = v_id;
  perform pg_temp.comprobar('anon NO ve lo que está sin publicar', v_ocultos = 0);

  reset role;
end $$;

\echo ''
\echo '========================================'
\echo '  El bucket de medios: no escribe nadie'
\echo '========================================'

/*
  BODA-29 · BLOQUEANTE.

  El bucket es PÚBLICO para leer —una foto se pinta con `<img src>` y un
  navegador no manda la clave de la API—, así que aquí no se comprueba la
  lectura: se comprueba lo único que de verdad hay que defender, que es la
  ESCRITURA. Con la clave anónima viajando en el bundle de la landing,
  cualquiera puede intentar subir un fichero al bucket de la boda.

  LO QUE SE AFIRMA ES UNA AUSENCIA, y por eso hay que afirmarlo. `storage.objects`
  tiene RLS activada y CERO políticas, y eso deniega todo. Es un estado que se
  rompe AÑADIENDO algo —una política «temporal» para depurar una subida, y de
  repente `anon` escribe—, no quitándolo, así que no basta con confiar en que
  nadie la ponga.

  Y no se puede arreglar con una política que diga «anon no»: `storage.objects`
  es de `supabase_storage_admin` y las migraciones corren como `postgres`, que
  ahí no puede crear ninguna. Costó un despliegue descubrirlo, con un «must be
  owner of table buckets» que en el PostgreSQL pelado de este mismo script no
  aparece, porque aquí el rol sí es dueño.

  Las subidas del panel van por una acción de servidor con la clave de servicio,
  que comprueba `puede_editar()` y compone ella la ruta: el navegador no recibe
  nunca un camino de escritura a Storage. Que un editor pueda subir se prueba de
  extremo a extremo, no aquí.
*/
do $$
declare
  v_editor    uuid;
  v_pudo      boolean;
  v_politicas bigint;
  v_rls       boolean;
begin
  select p.usuario_id into v_editor
    from public.perfiles as p
   where p.activo and p.rol = 'propietario'
   limit 1;

  select c.relrowsecurity into v_rls
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects';
  perform pg_temp.comprobar('storage.objects tiene RLS activada', coalesce(v_rls, false));

  select count(*) into v_politicas
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects';
  perform pg_temp.comprobar(
    'no hay ninguna política sobre storage.objects (sin política, RLS deniega)',
    v_politicas = 0
  );

  -- --- anon no escribe. Ni conociendo la ruta. -------------------------------
  begin
    set local role anon;
    insert into storage.objects (bucket_id, name)
    values ('medios', 'portada/colada-por-anon.jpg');
    v_pudo := true;
  exception when others then
    v_pudo := false;
  end;
  reset role;
  perform pg_temp.comprobar('anon NO puede subir al bucket de medios', v_pudo = false);

  -- --- ni con una sesión de editor: esa vía no existe ------------------------
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', v_editor::text, true);
    insert into storage.objects (bucket_id, name)
    values ('medios', 'portada/colada-por-un-editor.jpg');
    v_pudo := true;
  exception when others then
    v_pudo := false;
  end;
  reset role;
  perform pg_temp.comprobar(
    'ni un editor escribe directo: se sube por la acción de servidor',
    v_pudo = false
  );

  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
end $$;

/*
  Y que el bucket exista con la forma que espera la aplicación. Si alguien lo
  pone en privado, la landing deja de ver las fotos sin que falle nada: el
  `<img>` recibe un error y se queda el hueco, igual que llevaba pasando desde
  el principio por no existir el bucket.
*/
do $$
declare
  v_publico boolean;
  v_tope    bigint;
begin
  select b.public, b.file_size_limit into v_publico, v_tope
    from storage.buckets as b where b.id = 'medios';

  perform pg_temp.comprobar('el bucket «medios» existe y es público', coalesce(v_publico, false));
  perform pg_temp.comprobar('y tiene tope de peso', coalesce(v_tope, 0) > 0);
end $$;

\echo ''
\echo '========================================'
\echo '  El bucket de documentos: PRIVADO'
\echo '========================================'

/*
  BODA-72 · BLOQUEANTE.

  Al contrario que el de medios, este bucket guarda contratos con datos
  bancarios y firmas y NO es público: nadie lee por URL directa. La descarga
  legítima pasa por una acción de servidor que comprueba la sesión y firma
  una URL de caducidad corta con la clave de servicio.

  La escritura la deniega la misma ausencia que en medios: RLS activada y
  cero políticas sobre `storage.objects` (ya afirmado arriba, y vale para
  todos los buckets a la vez). Aquí se afirma lo propio de éste: que existe,
  que es privado y que `anon` tampoco cuela una subida nombrándolo.
*/
do $$
declare
  v_publico boolean;
  v_tope    bigint;
  v_pudo    boolean;
begin
  select b.public, b.file_size_limit into v_publico, v_tope
    from storage.buckets as b where b.id = 'documentos';

  perform pg_temp.comprobar(
    'el bucket «documentos» existe y NO es público',
    v_publico is not null and not v_publico
  );
  perform pg_temp.comprobar('y tiene tope de peso', coalesce(v_tope, 0) > 0);

  begin
    set local role anon;
    insert into storage.objects (bucket_id, name)
    values ('documentos', 'contratos/colado-por-anon.pdf');
    v_pudo := true;
  exception when others then
    v_pudo := false;
  end;
  reset role;
  perform pg_temp.comprobar('anon NO puede subir al bucket de documentos', v_pudo = false);

  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
end $$;

\echo ''
\echo '========================================'
\echo '  Playlist: sólo invitados, con tope'
\echo '========================================'

do $$
declare
  v_token text;
  v_ok    boolean;
  i       integer;
begin
  select token into v_token
    from public.crear_grupo_invitacion(
      'Grupo playlist', 2::smallint, 'ambos'::public.lado_invitacion,
      array['fiesta']::public.evento_boda[]
    );

  set local role anon;

  -- Sin token válido no se escribe: si no, la playlist de una web abierta a
  -- internet se llena de spam en cuestión de horas. Y NO LANZA: devuelve NULL,
  -- como las tres funciones del RSVP, para que el intento fallido sobreviva.
  -- Que sobrevive de verdad lo comprueba el bloque «todas las puertas».
  begin
    v_ok := public.sugerir_cancion('token-que-no-existe-0000000000000', 'Spam — Bot') is null;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.comprobar('sin token válido no se apunta canción: NULL, sin excepción', v_ok);

  begin
    v_ok := public.sugerir_cancion(v_token, 'La Flaca — Jarabe de Palo') is not null;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.comprobar('un invitado con su token sí puede sugerir', v_ok);

  -- La misma canción del mismo grupo es la que ya estaba: mismo id, una fila.
  -- Es lo que pasa cada vez que alguien pulsa «Cambiar la respuesta» sin tocar
  -- la canción, y antes se apuntaba otra vez.
  begin
    v_ok := public.sugerir_cancion(v_token, '  la flaca — JARABE de palo ')
          = public.sugerir_cancion(v_token, 'La Flaca — Jarabe de Palo');
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.comprobar('repetir la canción del grupo devuelve la que ya estaba', v_ok);

  -- Tope por grupo.
  begin
    for i in 1..12 loop
      perform public.sugerir_cancion(v_token, format('Canción de prueba %s', i));
    end loop;
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.comprobar('hay tope de canciones por grupo', v_ok);

  reset role;

  perform pg_temp.comprobar(
    'y en la tabla la canción repetida está una sola vez',
    (select count(*) from public.canciones_sugeridas as c
      where lower(btrim(c.texto)) = 'la flaca — jarabe de palo') = 1);
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
\echo '========================================'
\echo '  BODA-129/130 · las listas de contenido de la web'
\echo '========================================'

-- Lo que este bloque defiende: que las cuatro listas que el panel ya sabe
-- escribir —programa, cómo llegar, dress code y preguntas— sólo las escriba
-- quien puede editar, y que el IBAN siga siendo cosa de los novios.
--
-- IMPORTA MÁS DE LO QUE PARECE PORQUE RLS NO DA ERROR AL PROHIBIR UN `UPDATE`:
-- devuelve cero filas. La pantalla lo comprueba y traduce ese silencio a «un
-- lector no puede cambiar la web», pero si la política se aflojara un día, la
-- pantalla seguiría diciendo exactamente lo mismo y nadie se enteraría. Aquí se
-- mira la base.

do $$
declare
  v_lector uuid := '0d1e2f41-0000-4000-8000-00000000d129';
  t        text;
  v_ok     boolean;
  v_filas  bigint;
  v_id     uuid;
  tablas   text[] := array[
    'hitos_programa', 'rutas_llegada', 'consejos_vestimenta', 'preguntas_frecuentes',
    -- BODA-130: las dos con foto entran por la misma puerta que las otras cuatro.
    'hitos_historia', 'alojamientos'
  ];
begin
  perform set_config('request.jwt.claim.sub', '', true);

  delete from public.perfiles where usuario_id = v_lector;
  delete from auth.users where id = v_lector;
  delete from public.invitaciones_panel where correo_electronico = 'lector@boda129.test';

  -- UN LECTOR DE VERDAD: invitado, activo y con su rol. Un perfil inactivo
  -- también fallaría al escribir, pero por otro motivo, y entonces esto no
  -- estaría probando la política sino el interruptor de la cuenta.
  insert into public.invitaciones_panel (correo_electronico, rol) values ('lector@boda129.test', 'lector');
  insert into auth.users (id, email) values (v_lector, 'lector@boda129.test');

  perform pg_temp.comprobar(
    'el lector de prueba está activo y es lector',
    exists (select 1 from public.perfiles where usuario_id = v_lector and activo and rol = 'lector'));

  foreach t in array tablas loop
    -- Una fila retirada, escrita desde fuera de la sesión del lector, para
    -- comprobar de paso que ni siquiera la ve.
    execute format(
      'insert into public.%I (orden, publicado, %s) values (900, false, %s) returning id',
      t,
      case t
        when 'hitos_programa'       then 'hora, titulo'
        when 'rutas_llegada'        then 'modo'
        when 'consejos_vestimenta'  then 'titulo, texto'
        when 'hitos_historia'       then 'titulo'
        when 'alojamientos'         then 'nombre'
        else 'pregunta, respuesta'
      end,
      case t
        when 'hitos_programa'       then '''23:59'', ''Borrador de BODA-129'''
        when 'rutas_llegada'        then '''Borrador de BODA-129'''
        when 'consejos_vestimenta'  then '''Borrador de BODA-129'', ''Texto'''
        when 'hitos_historia'       then '''Borrador de BODA-130'''
        when 'alojamientos'         then '''Borrador de BODA-130'''
        else '''Borrador de BODA-129'', ''Respuesta'''
      end
    ) into v_id;

    set local role authenticated;
    perform set_config('request.jwt.claim.sub', v_lector::text, true);

    -- 1. Escribir de cero: la política `with check` sí lanza.
    begin
      execute format(
        'insert into public.%I (%s) values (%s)',
        t,
        case t
          when 'hitos_programa'       then 'hora, titulo'
          when 'rutas_llegada'        then 'modo'
          when 'consejos_vestimenta'  then 'titulo, texto'
          when 'hitos_historia'       then 'titulo'
          when 'alojamientos'         then 'nombre'
          else 'pregunta, respuesta'
        end,
        case t
          when 'hitos_programa'       then '''00:00'', ''Colado por un lector'''
          when 'rutas_llegada'        then '''Colado por un lector'''
          when 'consejos_vestimenta'  then '''Colado por un lector'', ''Texto'''
          when 'hitos_historia'       then '''Colado por un lector'''
          when 'alojamientos'         then '''Colado por un lector'''
          else '''Colado por un lector'', ''Respuesta'''
        end
      );
      v_ok := false;
    exception when others then
      v_ok := true;
    end;
    perform pg_temp.comprobar(format('un lector no puede añadir en %s', t), v_ok);

    -- 2. Y cambiar lo que ya hay: esto NO lanza, calla. Se cuentan las filas.
    execute format('update public.%I set orden = 1 where id = %L', t, v_id);
    get diagnostics v_filas = row_count;
    perform pg_temp.comprobar(format('un lector no puede cambiar nada en %s', t), v_filas = 0);

    execute format('update public.%I set publicado = true where id = %L', t, v_id);
    get diagnostics v_filas = row_count;
    perform pg_temp.comprobar(format('un lector no puede publicar en %s', t), v_filas = 0);

    -- 3. Ni borrar, que es lo único que no se deshace.
    execute format('delete from public.%I where id = %L', t, v_id);
    get diagnostics v_filas = row_count;
    perform pg_temp.comprobar(format('un lector no puede borrar de %s', t), v_filas = 0);

    -- 4. Un borrador no es suyo: la lectura pública es `using (publicado)`.
    execute format('select count(*) from public.%I where id = %L', t, v_id) into v_filas;
    perform pg_temp.comprobar(format('un lector no ve los borradores de %s', t), v_filas = 0);

    reset role;
    perform set_config('request.jwt.claim.sub', '', true);

    -- Y la fila sigue ahí, retirada y con su orden: no se cambió nada de nada.
    execute format(
      'select count(*) from public.%I where id = %L and orden = 900 and not publicado', t, v_id
    ) into v_filas;
    perform pg_temp.comprobar(format('la fila de %s está intacta', t), v_filas = 1);

    execute format('delete from public.%I where id = %L', t, v_id);
  end loop;

  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
end $$;

-- ANON TAMPOCO ESCRIBE, que es el caso que de verdad está expuesto: la clave
-- anónima viaja en el bundle de la landing, así que cualquiera puede intentarlo
-- desde la consola del navegador.
do $$
declare
  t      text;
  v_ok   boolean;
  tablas text[] := array[
    'hitos_programa', 'rutas_llegada', 'consejos_vestimenta', 'preguntas_frecuentes',
    'hitos_historia', 'alojamientos'
  ];
begin
  foreach t in array tablas loop
    set local role anon;
    begin
      execute format(
        'insert into public.%I (%s) values (%s)',
        t,
        case t
          when 'hitos_programa'       then 'hora, titulo'
          when 'rutas_llegada'        then 'modo'
          when 'consejos_vestimenta'  then 'titulo, texto'
          when 'hitos_historia'       then 'titulo'
          when 'alojamientos'         then 'nombre'
          else 'pregunta, respuesta'
        end,
        case t
          when 'hitos_programa'       then '''00:00'', ''Pintada de anon'''
          when 'rutas_llegada'        then '''Pintada de anon'''
          when 'consejos_vestimenta'  then '''Pintada de anon'', ''Texto'''
          when 'hitos_historia'       then '''Pintada de anon'''
          when 'alojamientos'         then '''Pintada de anon'''
          else '''Pintada de anon'', ''Respuesta'''
        end
      );
      v_ok := false;
    exception when others then
      v_ok := true;
    end;
    reset role;
    perform pg_temp.comprobar(format('anon no puede escribir en %s', t), v_ok);
  end loop;
end $$;

-- BODA-130 · BORRAR UNA FOTO NO BORRA LA FICHA QUE LA TENÍA PUESTA.
--
-- `medio_id` es `on delete set null` en las dos tablas con foto, y de eso
-- depende una promesa de la pantalla: que retirar una imagen deje el hotel en
-- pie, sin imagen. Con un `cascade` —que es el otro valor plausible y el que
-- alguien pondría sin pensarlo— borrar una foto se llevaría por delante el
-- hotel entero, su descripción y su enlace de reserva.

do $$
declare
  v_medio  uuid;
  v_hito   uuid;
  v_hotel  uuid;
  v_filas  bigint;
begin
  insert into public.medios (ruta_almacenamiento, texto_alternativo, seccion, tipo, publicado)
  values ('desarrollo/boda130.jpg', '{"es": "Foto de prueba de BODA-130"}'::jsonb,
          'historia'::public.seccion_landing, 'imagen'::public.tipo_medio, true)
  returning id into v_medio;

  insert into public.hitos_historia (titulo, medio_id) values ('Hito de BODA-130', v_medio)
  returning id into v_hito;

  insert into public.alojamientos (nombre, medio_id) values ('Hotel de BODA-130', v_medio)
  returning id into v_hotel;

  delete from public.medios where id = v_medio;

  select count(*) into v_filas from public.hitos_historia where id = v_hito;
  perform pg_temp.comprobar('borrar la foto deja el hito de la historia en pie', v_filas = 1);

  select count(*) into v_filas
    from public.hitos_historia where id = v_hito and medio_id is null;
  perform pg_temp.comprobar('y el hito se queda sin foto, no con una que no existe', v_filas = 1);

  select count(*) into v_filas from public.alojamientos where id = v_hotel;
  perform pg_temp.comprobar('borrar la foto deja el alojamiento en pie', v_filas = 1);

  select count(*) into v_filas
    from public.alojamientos where id = v_hotel and medio_id is null;
  perform pg_temp.comprobar('y el alojamiento se queda sin foto', v_filas = 1);

  delete from public.hitos_historia where id = v_hito;
  delete from public.alojamientos where id = v_hotel;
end $$;

-- Y LA FOTO EN BORRADOR NO SALE A LA WEB POR LA PUERTA DE ATRÁS. `anon` no ve
-- un medio sin publicar cuando pregunta por `medios`; lo que este bloque
-- defiende es que tampoco lo vea preguntando por el hito que lo enlaza, que es
-- por donde se colaría.

do $$
declare
  v_medio uuid;
  v_hito  uuid;
  v_ruta  text;
begin
  insert into public.medios (ruta_almacenamiento, texto_alternativo, seccion, tipo, publicado)
  values ('desarrollo/boda130-borrador.jpg', '{"es": "Borrador de BODA-130"}'::jsonb,
          'historia'::public.seccion_landing, 'imagen'::public.tipo_medio, false)
  returning id into v_medio;

  insert into public.hitos_historia (titulo, medio_id, publicado)
  values ('Hito con foto en borrador', v_medio, true)
  returning id into v_hito;

  set local role anon;
  select m.ruta_almacenamiento into v_ruta
    from public.hitos_historia as h
    left join public.medios as m on m.id = h.medio_id and m.publicado and m.tipo = 'imagen'
   where h.id = v_hito;
  reset role;

  perform pg_temp.comprobar(
    'un hito publicado con foto en borrador sale SIN la foto', v_ruta is null);

  delete from public.hitos_historia where id = v_hito;
  delete from public.medios where id = v_medio;
end $$;

\echo ''
\echo '========================================'
\echo '  BODA-129 · el IBAN es cosa de los novios'
\echo '========================================'

-- El número de cuenta al que la gente manda dinero. Un editor gestiona toda la
-- boda —invitados, proveedores, presupuesto— y aun así no toca esto: cambiarlo
-- es redirigir los regalos de todo el mundo a otra cuenta.
--
-- La política es `configuracion_privada_propietario_actualizar`, y su `using`
-- hace que a un editor el `update` le devuelva CERO FILAS SIN ERROR. Por eso la
-- acción del panel cuenta las filas tocadas y dice «sólo un propietario»: aquí
-- se comprueba que esa cuenta de filas es cero de verdad.

do $$
declare
  v_editor      uuid := '0d1e2f42-0000-4000-8000-00000000d129';
  v_propietario uuid := '0d1e2f43-0000-4000-8000-00000000d129';
  v_lector      uuid := '0d1e2f41-0000-4000-8000-00000000d129';
  v_original    text;
  v_filas       bigint;
begin
  perform set_config('request.jwt.claim.sub', '', true);

  -- Se guarda para devolverlo al final: esta suite se lanza varias veces contra
  -- la misma base y el IBAN es un dato de la boda, no un resto de un test.
  select iban_regalos into v_original from public.configuracion_privada;

  delete from public.perfiles where usuario_id in (v_editor, v_propietario);
  delete from auth.users where id in (v_editor, v_propietario);
  delete from public.invitaciones_panel
   where correo_electronico in ('editor@boda129.test', 'novia@boda129.test');

  insert into public.invitaciones_panel (correo_electronico, rol)
  values ('editor@boda129.test', 'editor'), ('novia@boda129.test', 'propietario');
  insert into auth.users (id, email)
  values (v_editor, 'editor@boda129.test'), (v_propietario, 'novia@boda129.test');

  -- --- Un editor: lo lee, pero no lo cambia -------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_editor::text, true);

  select count(*) into v_filas from public.configuracion_privada;
  perform pg_temp.comprobar('un editor sí puede leer la configuración privada', v_filas = 1);

  update public.configuracion_privada set iban_regalos = 'ES9900000000000000000001';
  get diagnostics v_filas = row_count;
  perform pg_temp.comprobar('un editor no puede cambiar el IBAN', v_filas = 0);

  reset role;

  -- --- Un lector: ni siquiera lo ve ---------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_lector::text, true);

  select count(*) into v_filas from public.configuracion_privada;
  perform pg_temp.comprobar('un lector no ve la configuración privada', v_filas = 0);

  reset role;

  -- --- Y un propietario: sí -----------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_propietario::text, true);

  update public.configuracion_privada
     set iban_regalos = 'ES9121000418450200051332', titular_cuenta = 'Paula y David';
  get diagnostics v_filas = row_count;
  perform pg_temp.comprobar('un propietario sí puede escribir el IBAN', v_filas = 1);

  reset role;

  perform pg_temp.comprobar(
    'y lo escrito es lo que queda',
    (select iban_regalos from public.configuracion_privada) = 'ES9121000418450200051332');

  -- El formato lo vigila la base, no sólo el formulario: quien mande el `update`
  -- desde fuera del panel se encuentra con el mismo `CHECK`.
  begin
    update public.configuracion_privada set iban_regalos = 'no es un iban';
    v_filas := 0;
  exception when check_violation then
    v_filas := 1;
  end;
  perform pg_temp.comprobar('un IBAN con mala pinta no entra ni por SQL', v_filas = 1);

  update public.configuracion_privada set iban_regalos = v_original;

  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
end $$;

-- ----------------------------------------------------------------------------
-- `force row level security`: la regla que estaba escrita y nadie comprobaba
--
-- `enable` no se aplica al propietario de la tabla, y en Supabase el propietario
-- es quien ejecuta toda función `security definer`. Sin `force`, dentro de
-- cualquier definer la RLS de esa tabla está apagada.
--
-- La regla lleva escrita desde 20260803090400_rls.sql, con sus diez excepciones
-- justificadas una a una — y no había nada que la vigilara. Una tabla nacida
-- después se quedó sin `force` sin que nada lo dijera. Esto lo dice.
--
-- La lista de excepciones va aquí ENTERA y a mano, a propósito: añadir una es
-- una decisión de seguridad y tiene que costar escribirla, no heredarse de lo
-- que la base tenga puesto hoy.
-- ----------------------------------------------------------------------------

do $$
declare
  v_sin_forzar text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into v_sin_forzar
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relforcerowsecurity
     and c.relname not in (
       -- Las leen las funciones de rol y el trigger de alta, antes de que haya sesión.
       'perfiles', 'invitaciones_panel',
       -- Las usa el trigger de auditoría.
       'registro_auditoria', 'campos_auditoria_redactados',
       -- Es pública entera; la leen los triggers de plazo y de accesibilidad.
       'configuracion_boda',
       -- Las usa el cortafuegos del RSVP.
       'parametros_seguridad', 'intentos_rsvp',
       -- Las recorren las funciones públicas del RSVP.
       'grupos_invitacion', 'invitados', 'confirmaciones'
     );

  perform pg_temp.comprobar(
    format('toda tabla fuerza la RLS salvo las diez excepciones (sin forzar: %s)',
           coalesce(v_sin_forzar, 'ninguna')),
    v_sin_forzar is null);

  -- Y al revés: que la lista de excepciones no se quede con nombres de tablas
  -- que ya no existen, porque entonces dejaría pasar a la siguiente que se
  -- llamara igual sin que nadie lo hubiera decidido.
  perform pg_temp.comprobar(
    'las diez excepciones siguen existiendo como tablas',
    (select count(*)
       from pg_class as c
       join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relname in (
          'perfiles', 'invitaciones_panel', 'registro_auditoria',
          'campos_auditoria_redactados', 'configuracion_boda',
          'parametros_seguridad', 'intentos_rsvp',
          'grupos_invitacion', 'invitados', 'confirmaciones'
        )) = 10);
end $$;

\echo ''
\echo '========================================'
\echo '  El cortafuegos cubre todas las puertas'
\echo '========================================'

-- Lo que se reprodujo antes de arreglarlo: `sugerir_cancion` anotaba el intento
-- y lanzaba, y la excepción se llevaba el registro; `destinatarios_confirmacion`
-- ni lo intentaba. Sondear tokens por cualquiera de las dos no contaba. Aquí se
-- cuenta la bitácora ANTES y DESPUÉS de cada llamada con un token inventado,
-- como superusuario, que es el único que puede leerla.
do $$
declare
  v_token   text;
  v_grupo   uuid;
  v_antes   bigint;
  v_despues bigint;
  v_filas   bigint;
  v_ok      boolean;
  v_limite  timestamptz;
  v_id      uuid;
begin
  select token, grupo_id into v_token, v_grupo
    from public.crear_grupo_invitacion(
      'Grupo puertas', 2::smallint, 'ambos'::public.lado_invitacion,
      array['fiesta']::public.evento_boda[]
    );
  insert into public.invitados (grupo_id, nombre, correo_electronico)
  values (v_grupo, 'Puerta', 'puerta@boda.test');

  -- --- sugerir_cancion --------------------------------------------------------
  select count(*) into v_antes from public.intentos_rsvp where not exito;
  begin
    set local role anon;
    perform public.sugerir_cancion('token-inventado-para-sondear-00001', 'Spam');
  exception when others then
    null;
  end;
  reset role;
  select count(*) into v_despues from public.intentos_rsvp where not exito;
  perform pg_temp.comprobar(
    'un token inventado en sugerir_cancion deja rastro en el cortafuegos',
    v_despues = v_antes + 1);

  -- --- destinatarios_confirmacion --------------------------------------------
  select count(*) into v_antes from public.intentos_rsvp where not exito;
  begin
    set local role anon;
    select count(*) into v_filas
      from public.destinatarios_confirmacion('token-inventado-para-sondear-00002');
  exception when others then
    v_filas := -1;
  end;
  reset role;
  select count(*) into v_despues from public.intentos_rsvp where not exito;
  perform pg_temp.comprobar(
    'un token inventado en destinatarios_confirmacion da cero filas',
    v_filas = 0);
  perform pg_temp.comprobar(
    'y deja rastro en el cortafuegos',
    v_despues = v_antes + 1);

  begin
    set local role anon;
    select count(*) into v_filas from public.destinatarios_confirmacion(v_token);
  exception when others then
    v_filas := -1;
  end;
  reset role;
  perform pg_temp.comprobar(
    'con el token bueno, destinatarios_confirmacion sigue dando el correo del grupo',
    v_filas = 1);

  -- --- anadir_acompanante y el plazo ------------------------------------------
  select c.fecha_limite_rsvp into v_limite from public.configuracion_boda as c;
  update public.configuracion_boda set fecha_limite_rsvp = now() - interval '1 day';
  begin
    set local role anon;
    v_id := public.anadir_acompanante(v_token, 'Colado', 'Tarde');
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like '%RSV03%';
  end;
  reset role;
  update public.configuracion_boda set fecha_limite_rsvp = v_limite;
  perform pg_temp.comprobar(
    'con el plazo vencido, anadir_acompanante lanza RSV03 y no da de alta a nadie',
    v_ok and not exists (select 1 from public.invitados where grupo_id = v_grupo and nombre = 'Colado'));

  begin
    set local role anon;
    v_id := public.anadir_acompanante(v_token, 'A tiempo', 'Bien');
    v_ok := v_id is not null;
  exception when others then
    v_ok := false;
  end;
  reset role;
  perform pg_temp.comprobar('y con el plazo abierto sigue dando de alta', v_ok);

  delete from public.grupos_invitacion where id = v_grupo;
end $$;

-- Ninguna función ejecutable por `anon` salvo las puertas públicas, y la lista
-- es cerrada en los dos sentidos: ni una de más ni una de menos. Era el guardia
-- (c) de la cabecera de `rls.sql`, escrito como comentario; como comentario no
-- cazó a `avisos_programa_validos()`.
do $$
declare
  v_de_mas  text;
  v_de_menos text;
  v_puertas text[] := array[
    'obtener_invitacion', 'registrar_confirmacion', 'anadir_acompanante',
    'sugerir_cancion', 'destinatarios_confirmacion', 'datos_para_regalos'
  ];
  v_anon_puede boolean;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_de_mas
    from pg_proc as p
   where p.pronamespace = 'public'::regnamespace
     and has_function_privilege('anon', p.oid, 'execute')
     and p.proname <> all (v_puertas);
  perform pg_temp.comprobar(
    format('anon sólo ejecuta las seis puertas públicas (de más: %s)', coalesce(v_de_mas, 'ninguna')),
    v_de_mas is null);

  select string_agg(puerta, ', ' order by puerta) into v_de_menos
    from unnest(v_puertas) as puerta
   where not exists (
     select 1 from pg_proc as p
      where p.pronamespace = 'public'::regnamespace
        and p.proname = puerta
        and has_function_privilege('anon', p.oid, 'execute'));
  perform pg_temp.comprobar(
    format('y las seis existen y las puede ejecutar (de menos: %s)', coalesce(v_de_menos, 'ninguna')),
    v_de_menos is null);

  -- Los default privileges existen de verdad: una función creada AHORA, sin
  -- ningún grant, no la puede ejecutar anon. Antes de la migración
  -- 20260919200000 nacía ejecutable, y `pg_default_acl` estaba vacía.
  execute 'create function public.prueba_default_privileges() returns integer language sql immutable as ''select 1''';
  select has_function_privilege('anon', 'public.prueba_default_privileges()', 'execute') into v_anon_puede;
  execute 'drop function public.prueba_default_privileges()';
  perform pg_temp.comprobar('una función nueva nace SIN execute para anon', not v_anon_puede);
end $$;

-- `avisos_programa_validos` se cerró, pero vive en un CHECK de
-- `configuracion_boda`: si el editor no pudiera ejecutarla, no podría guardar
-- Ajustes. Se comprueba escribiendo de verdad como propietario.
do $$
declare
  v_editor uuid;
  v_ok     boolean;
  v_antes  text[];
begin
  select p.usuario_id into v_editor
    from public.perfiles as p
   where p.activo and p.rol in ('propietario', 'editor')
   limit 1;

  if v_editor is null then
    raise warning 'SIN DATOS: no hay ningún perfil editor con el que probar el CHECK de avisos';
    return;
  end if;

  select c.avisos_programa into v_antes from public.configuracion_boda as c;

  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', v_editor::text, true);
    update public.configuracion_boda
       set avisos_programa = array['Césped y grava: cuidado con los tacones finos'];
    v_ok := true;
  exception when others then
    v_ok := false;
    raise warning 'al guardar los avisos: %', sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  update public.configuracion_boda set avisos_programa = v_antes;

  perform pg_temp.comprobar(
    'un editor sigue pudiendo guardar los avisos del programa (el CHECK ejecuta avisos_programa_validos)',
    v_ok);
end $$;

\echo ''
\echo ''
\echo 'SUITE-COMPLETA'
