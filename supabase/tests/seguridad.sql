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
  -- internet se llena de spam en cuestión de horas.
  begin
    perform public.sugerir_cancion('token-que-no-existe-0000000000000', 'Spam — Bot');
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.comprobar('sin token válido no se puede sugerir canción', v_ok);

  begin
    perform public.sugerir_cancion(v_token, 'La Flaca — Jarabe de Palo');
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.comprobar('un invitado con su token sí puede sugerir', v_ok);

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
