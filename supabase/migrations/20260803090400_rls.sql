-- ============================================================================
-- 20260803090400_rls.sql
-- Ticket: BODA-14 (políticas RLS, privilegios y límite de intentos)
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero:
--   1. Parámetros de seguridad y bitácora de intentos contra el RSVP.
--   2. Funciones de rol (`rol_actual`, `puede_leer`, `puede_editar`,
--      `es_propietario`), todas exigiendo perfil ACTIVO.
--   3. Privilegios: se conceden uno a uno, y sólo los imprescindibles. Los
--      privilegios por defecto ya se revocaron en la migración base, así que
--      hasta aquí ninguna tabla del proyecto era accesible por la API.
--   4. Políticas RLS de las 22 tablas.
--   5. `force row level security` donde ninguna función interna lo impide.
--
-- El modelo, en una frase: `anon` sólo ve la landing (configuración pública,
-- secciones visibles y fotos publicadas) y llega al RSVP únicamente a través de
-- dos funciones; un colaborador ve lo que su rol permite; nadie escribe en el
-- histórico ni en la bitácora.
--
-- TRUNCATE: nunca se concede. RLS no se aplica a TRUNCATE, así que conceder
-- `all` sobre una tabla equivale a regalar un borrado total inmune a políticas.
-- Por eso aquí los GRANT enumeran siempre las operaciones.
--
-- Rollback: supabase/migrations/rollback/20260803090400_rls.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Parámetros de seguridad
--    Los límites del cortafuegos del RSVP son configuración, no código: se
--    ajustan sin migración y sin desplegar (regla 1).
-- ----------------------------------------------------------------------------

create table if not exists public.parametros_seguridad (
  id                        uuid not null default gen_random_uuid(),
  fila_unica                boolean not null default true,

  maximo_intentos_rsvp      smallint not null default 10,
  ventana_intentos_minutos  smallint not null default 15,
  dias_retencion_intentos   smallint not null default 30,

  creado_en                 timestamptz not null default now(),
  actualizado_en            timestamptz not null default now(),

  constraint parametros_seguridad_pk primary key (id),
  constraint parametros_seguridad_fila_unica_valor check (fila_unica),
  constraint parametros_seguridad_fila_unica unique (fila_unica),

  constraint parametros_seguridad_maximo_intentos_rango
    check (maximo_intentos_rsvp between 1 and 1000),
  constraint parametros_seguridad_ventana_rango
    check (ventana_intentos_minutos between 1 and 1440),
  constraint parametros_seguridad_retencion_rango
    check (dias_retencion_intentos between 1 and 365)
);
alter table public.parametros_seguridad enable row level security;

comment on table public.parametros_seguridad is
  'Fila única con los límites del cortafuegos del RSVP. Un token de 192 bits no '
  'se adivina por fuerza bruta, pero el límite evita que alguien use el endpoint '
  'público como amplificador o para sondear el esquema.';

create or replace trigger parametros_seguridad_actualizado_en
  before update on public.parametros_seguridad
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();

insert into public.parametros_seguridad (fila_unica) values (true)
on conflict (fila_unica) do nothing;


-- ----------------------------------------------------------------------------
-- 2. Intentos contra el RSVP
-- ----------------------------------------------------------------------------

create table if not exists public.intentos_rsvp (
  id           uuid not null default gen_random_uuid(),
  huella       text not null,
  huella_token   bytea,
  exito        boolean not null default false,
  creado_en    timestamptz not null default now(),

  constraint intentos_rsvp_pk primary key (id),
  constraint intentos_rsvp_huella_longitud
    check (length(btrim(huella)) between 1 and 200)
);
alter table public.intentos_rsvp enable row level security;

comment on table public.intentos_rsvp is
  'Bitácora de intentos de resolver un token de invitación. Sólo la escriben las '
  'funciones públicas del RSVP; ningún rol tiene INSERT.';
comment on column public.intentos_rsvp.huella is
  'Identificación aproximada del origen (IP reenviada por el proxy de Supabase). '
  'No es una identidad: es lo único con lo que se puede contar intentos en un '
  'endpoint anónimo.';
comment on column public.intentos_rsvp.huella_token is
  'Huella SHA-256 del token que se intentó, nunca el token. Permite distinguir '
  '"alguien se equivoca de enlace" de "alguien prueba enlaces al azar" sin '
  'guardar la credencial.';

create index if not exists intentos_rsvp_huella_idx
  on public.intentos_rsvp (huella, creado_en desc);

create index if not exists intentos_rsvp_creado_en_idx
  on public.intentos_rsvp (creado_en);


-- ----------------------------------------------------------------------------
-- 3. Funciones de rol
--
--    Todas exigen `activo`. Es la pieza que hace que registrarse con la clave
--    anónima no conceda absolutamente nada: el perfil nace inactivo salvo que el
--    correo figure en `invitaciones_panel`.
--
--    SECURITY DEFINER y no INVOKER porque una política sobre `perfiles` que
--    consultara `perfiles` provocaría recursión infinita (42P17).
-- ----------------------------------------------------------------------------

create or replace function public.rol_actual()
returns public.rol_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select p.rol
    from public.perfiles as p
   where p.usuario_id = (select auth.uid())
     and p.activo
   limit 1;
$$;

comment on function public.rol_actual() is
  'Rol efectivo de quien hace la petición, o NULL si no hay sesión, no hay perfil '
  'o el perfil está dado de baja. Es la única fuente de autorización del panel.';

create or replace function public.puede_leer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.rol_actual() is not null;
$$;

comment on function public.puede_leer() is
  'Cierto para cualquier colaborador activo (lector, editor o propietario).';

create or replace function public.puede_editar()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() in ('propietario', 'editor'), false);
$$;

comment on function public.puede_editar() is
  'Cierto para editor y propietario. Nunca devuelve NULL: un NULL en una política '
  'se comporta como falso, pero en un `not ...` de un trigger sería un agujero.';

create or replace function public.es_propietario()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() = 'propietario', false);
$$;

comment on function public.es_propietario() is
  'Cierto sólo para los novios. Gobierna la gestión de usuarios, la configuración '
  'privada y la lectura de la bitácora de auditoría.';


-- Valores declarados del propio perfil, para el `with check` de la política de
-- autoedición. Van en funciones SECURITY DEFINER por el mismo motivo de
-- recursión: una política de `perfiles` no puede leer `perfiles`.

create or replace function public.rol_declarado()
returns public.rol_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select p.rol from public.perfiles as p where p.usuario_id = (select auth.uid()) limit 1;
$$;

create or replace function public.alta_declarada()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p.activo from public.perfiles as p where p.usuario_id = (select auth.uid()) limit 1;
$$;

comment on function public.rol_declarado() is
  'Rol almacenado del propio perfil, con independencia de si está activo. Sólo lo '
  'usa la política de autoedición para congelar la columna.';
comment on function public.alta_declarada() is
  'Valor almacenado de `activo` del propio perfil. Sólo lo usa la política de '
  'autoedición para congelar la columna.';


-- ----------------------------------------------------------------------------
-- 4. Privilegios
--    Se parte de cero (la migración base revocó las default privileges) y se
--    concede lo mínimo. RLS filtra filas ENCIMA de esto; el GRANT decide a qué
--    tablas se puede siquiera dirigir una petición.
-- ----------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

-- 4.1 anon: sólo lo que pinta la landing ------------------------------------
grant select on public.configuracion_boda to anon;
grant select on public.secciones_landing  to anon;
grant select on public.medios             to anon;

-- 4.2 authenticated: lectura -------------------------------------------------
grant select on
  public.configuracion_boda,
  public.configuracion_privada,
  public.secciones_landing,
  public.perfiles,
  public.invitaciones_panel,
  public.registro_auditoria,
  public.campos_auditoria_redactados,
  public.parametros_seguridad,
  public.intentos_rsvp,
  public.grupos_invitacion,
  public.notas_grupo,
  public.invitados,
  public.notas_invitado,
  public.confirmaciones,
  public.categorias_proveedor,
  public.proveedores,
  public.documentos_proveedor,
  public.servicios,
  public.categorias_presupuesto,
  public.partidas_presupuesto,
  public.pagos,
  public.tareas,
  public.mesas,
  public.medios
  to authenticated;

-- 4.3 authenticated: escritura ------------------------------------------------
-- `confirmaciones` queda deliberadamente FUERA: el histórico es de sólo
-- inserción, y el UPDATE de vigencia lo hace un trigger SECURITY DEFINER.
grant insert, update, delete on
  public.grupos_invitacion,
  public.notas_grupo,
  public.invitados,
  public.notas_invitado,
  public.categorias_proveedor,
  public.proveedores,
  public.documentos_proveedor,
  public.servicios,
  public.categorias_presupuesto,
  public.partidas_presupuesto,
  public.pagos,
  public.tareas,
  public.mesas,
  public.medios
  to authenticated;

grant insert on public.confirmaciones to authenticated;

grant update on
  public.configuracion_boda,
  public.configuracion_privada,
  public.secciones_landing,
  public.perfiles,
  public.parametros_seguridad
  to authenticated;

grant insert, update, delete on public.invitaciones_panel to authenticated;

-- Funciones de rol. Primero se cierran y después se abren SÓLO a
-- `authenticated`, nombrando explícitamente a `public` y a `anon`.
--
-- El `revoke ... from public` NO es decorativo ni redundante con las default
-- privileges revocadas en la migración base: se ha comprobado que toda función
-- nueva sigue naciendo con EXECUTE para el pseudo-rol PUBLIC, del que `anon`
-- hereda. Sin estas líneas, `select public.rol_actual()` sería invocable como
-- RPC con la clave anónima.
revoke execute on function public.rol_actual()      from public, anon, authenticated;
revoke execute on function public.puede_leer()      from public, anon, authenticated;
revoke execute on function public.puede_editar()    from public, anon, authenticated;
revoke execute on function public.es_propietario()  from public, anon, authenticated;
revoke execute on function public.rol_declarado()   from public, anon, authenticated;
revoke execute on function public.alta_declarada()  from public, anon, authenticated;

-- Las evalúan las propias políticas, así que el rol que consulta necesita
-- EXECUTE. No revelan nada que quien llama no sepa ya de sí mismo. `anon` queda
-- fuera: ninguna política suya las usa.
grant execute on function public.rol_actual()      to authenticated;
grant execute on function public.puede_leer()      to authenticated;
grant execute on function public.puede_editar()    to authenticated;
grant execute on function public.es_propietario()  to authenticated;
grant execute on function public.rol_declarado()   to authenticated;
grant execute on function public.alta_declarada()  to authenticated;


-- ----------------------------------------------------------------------------
-- 5. Políticas
--    Convención: `<tabla>_<quién>_<qué>`. Todas llevan cláusula TO explícita
--    (`auth.role()` está obsoleto y además se rompe con inicios de sesión
--    anónimos), y todas envuelven las funciones en `(select ...)` para que se
--    evalúen una vez por sentencia y no una vez por fila.
--
--    Antes de crearlas se borran TODAS las políticas del esquema público.
--    PostgreSQL no admite `create policy if not exists`, así que sin esto la
--    migración no se puede reaplicar: muere en la primera política que ya
--    exista, justo cuando se está reintentando un despliegue que falló a mitad.
--
--    Además, borrar y recrear es la semántica correcta para una migración de
--    seguridad: reaplicarla CONVERGE el estado exacto de las políticas en vez
--    de acumularlas. Si alguien añadió una política a mano en el panel de
--    Supabase, ésta desaparece; y una política de más es precisamente el tipo
--    de deriva que no queremos que sobreviva a un despliegue.
-- ----------------------------------------------------------------------------

do $$
declare
  v_politica record;
begin
  for v_politica in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I',
                   v_politica.policyname, v_politica.schemaname, v_politica.tablename);
  end loop;
end;
$$;

-- 5.1 Configuración pública ---------------------------------------------------

create policy configuracion_boda_publica_leer on public.configuracion_boda
  for select to anon, authenticated using (true);

create policy configuracion_boda_editor_actualizar on public.configuracion_boda
  for update to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

comment on policy configuracion_boda_publica_leer on public.configuracion_boda is
  'La fila entera es publicable por diseño: todo lo sensible vive en '
  '`configuracion_privada`. Por eso `using (true)` aquí es seguro y no lo sería '
  'si ambas cosas compartieran tabla.';

-- 5.2 Configuración privada ---------------------------------------------------

create policy configuracion_privada_editor_leer on public.configuracion_privada
  for select to authenticated using ((select public.puede_editar()));

create policy configuracion_privada_propietario_actualizar on public.configuracion_privada
  for update to authenticated
  using ((select public.es_propietario()))
  with check ((select public.es_propietario()));

-- 5.3 Secciones de la landing -------------------------------------------------

create policy secciones_landing_publica_leer on public.secciones_landing
  for select to anon using (visible);

create policy secciones_landing_colaborador_leer on public.secciones_landing
  for select to authenticated using ((select public.puede_leer()));

create policy secciones_landing_editor_actualizar on public.secciones_landing
  for update to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

-- 5.4 Perfiles ----------------------------------------------------------------

create policy perfiles_propio_leer on public.perfiles
  for select to authenticated using (usuario_id = (select auth.uid()));

create policy perfiles_colaborador_leer on public.perfiles
  for select to authenticated using ((select public.puede_leer()));

create policy perfiles_propio_actualizar on public.perfiles
  for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (
    usuario_id = (select auth.uid())
    -- Cinturón, además de los tirantes del trigger
    -- `perfiles_proteger_privilegios`: cambiar el nombre y ascenderse a
    -- propietario no pueden ser la misma operación.
    and rol    = (select public.rol_declarado())
    and activo = (select public.alta_declarada())
  );

create policy perfiles_propietario_gestionar on public.perfiles
  for all to authenticated
  using ((select public.es_propietario()))
  with check ((select public.es_propietario()));

-- 5.5 Lista blanca de acceso al panel ----------------------------------------

create policy invitaciones_panel_propietario_gestionar on public.invitaciones_panel
  for all to authenticated
  using ((select public.es_propietario()))
  with check ((select public.es_propietario()));

-- 5.6 Auditoría ---------------------------------------------------------------
-- Sólo SELECT y sólo propietario. Sin política de INSERT: la única vía de
-- escritura es el trigger SECURITY DEFINER, de modo que nadie puede fabricar ni
-- suprimir entradas desde la API. Y sin UPDATE ni DELETE para nadie: un
-- histórico que se puede editar no es un histórico.

create policy registro_auditoria_propietario_leer on public.registro_auditoria
  for select to authenticated using ((select public.es_propietario()));

create policy campos_auditoria_redactados_propietario_leer on public.campos_auditoria_redactados
  for select to authenticated using ((select public.es_propietario()));

-- 5.7 Seguridad del RSVP ------------------------------------------------------

create policy parametros_seguridad_propietario_leer on public.parametros_seguridad
  for select to authenticated using ((select public.es_propietario()));

create policy parametros_seguridad_propietario_actualizar on public.parametros_seguridad
  for update to authenticated
  using ((select public.es_propietario()))
  with check ((select public.es_propietario()));

create policy intentos_rsvp_propietario_leer on public.intentos_rsvp
  for select to authenticated using ((select public.es_propietario()));

-- 5.8 Invitados, grupos y confirmaciones --------------------------------------
-- `anon` NO tiene ninguna política aquí, ni ningún GRANT: la ruta pública del
-- RSVP pasa exclusivamente por `obtener_invitacion()` y `registrar_confirmacion()`.

create policy grupos_invitacion_colaborador_leer on public.grupos_invitacion
  for select to authenticated using ((select public.puede_leer()));

create policy grupos_invitacion_editor_escribir on public.grupos_invitacion
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

create policy invitados_colaborador_leer on public.invitados
  for select to authenticated using ((select public.puede_leer()));

create policy invitados_editor_escribir on public.invitados
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

create policy confirmaciones_colaborador_leer on public.confirmaciones
  for select to authenticated using ((select public.puede_leer()));

create policy confirmaciones_editor_insertar on public.confirmaciones
  for insert to authenticated with check ((select public.puede_editar()));

comment on policy confirmaciones_editor_insertar on public.confirmaciones is
  'Sólo INSERT. No hay política de UPDATE ni de DELETE para ningún rol: el '
  'historial es de sólo inserción y quien cambia de opinión genera una fila '
  'nueva. La degradación de la respuesta anterior la hace un trigger SECURITY '
  'DEFINER, no el cliente.';

-- Las notas privadas quedan fuera del alcance del rol `lector`: son comentarios
-- de los novios sobre sus invitados.
create policy notas_grupo_editor_gestionar on public.notas_grupo
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

create policy notas_invitado_editor_gestionar on public.notas_invitado
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

-- 5.9 Economía y organización -------------------------------------------------
-- Mismo patrón para las nueve tablas: lectura para cualquier colaborador activo,
-- escritura para editor y propietario. Se generan en bucle para que ninguna se
-- quede sin política por un despiste al copiar y pegar.

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'categorias_proveedor',
    'proveedores',
    'documentos_proveedor',
    'servicios',
    'categorias_presupuesto',
    'partidas_presupuesto',
    'pagos',
    'tareas',
    'mesas'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.puede_leer()))',
      v_tabla || '_colaborador_leer', v_tabla);

    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.puede_editar()))
         with check ((select public.puede_editar()))',
      v_tabla || '_editor_escribir', v_tabla);
  end loop;
end;
$$;

-- 5.10 Medios -----------------------------------------------------------------

create policy medios_publica_leer on public.medios
  for select to anon using (publicado);

create policy medios_colaborador_leer on public.medios
  for select to authenticated using ((select public.puede_leer()));

create policy medios_editor_escribir on public.medios
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

comment on policy medios_publica_leer on public.medios is
  'La landing sólo ve lo publicado. Un borrador subido y aún sin revisar no se '
  'filtra por pedir la tabla entera con la clave anónima.';


-- ----------------------------------------------------------------------------
-- 6. `force row level security`
--
--    `enable` no aplica al PROPIETARIO de la tabla, que en Supabase es también
--    el propietario de las funciones SECURITY DEFINER. Sin `force`, dentro de
--    cualquier función definer —presente o futura— la RLS de estas tablas está
--    sencillamente desactivada, y la seguridad pasa a depender de que el WHERE
--    de esa función esté bien escrito.
--
--    Se fuerza en todas las tablas MENOS en aquellas que la maquinaria interna
--    necesita tocar como propietario. Cada excepción está justificada; no son
--    olvidos:
--
--      · perfiles, invitaciones_panel .... las leen las funciones de rol y el
--                                          trigger de alta, que se ejecutan
--                                          antes de que exista sesión.
--      · registro_auditoria ............. la escribe el trigger de auditoría.
--      · campos_auditoria_redactados .... la lee ese mismo trigger.
--      · configuracion_boda ............. es pública entera; la leen los
--                                          triggers de plazo y de accesibilidad.
--      · parametros_seguridad ........... la lee el cortafuegos del RSVP.
--      · intentos_rsvp .................. la escribe el cortafuegos del RSVP.
--      · grupos_invitacion, invitados,
--        confirmaciones ................. las recorren las dos funciones
--                                          públicas del RSVP.
--
--    Para esas siete últimas, la compensación es de diseño y está en
--    20260803090500_funciones_publicas.sql: ninguna función pública declara
--    `returns setof <tabla>` ni usa `select *`, y el filtro por token va SIEMPRE
--    en la misma sentencia que lee o escribe, nunca en una comprobación previa.
-- ----------------------------------------------------------------------------

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'configuracion_privada',
    'secciones_landing',
    'notas_grupo',
    'notas_invitado',
    'categorias_proveedor',
    'proveedores',
    'documentos_proveedor',
    'servicios',
    'categorias_presupuesto',
    'partidas_presupuesto',
    'pagos',
    'tareas',
    'mesas',
    'medios'
  ]
  loop
    execute format('alter table public.%I force row level security', v_tabla);
  end loop;
end;
$$;


-- ----------------------------------------------------------------------------
-- 7. Guardias para el CI
--    Las tres consultas siguientes DEBEN devolver cero filas. Van como
--    comentario porque su sitio es la suite de tests (regla 4 del proyecto),
--    pero se dejan aquí escritas para que nadie tenga que reinventarlas.
--
--    a) Ninguna tabla del esquema público sin RLS:
--       select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
--
--    b) Ninguna vista sin `security_invoker`, ninguna vista materializada.
--       Ojo: PostgreSQL guarda la opción tal cual se escribió, así que vale
--       tanto `on` como `true`. Comparar sólo contra 'true' marca como
--       inseguras las ocho vistas del proyecto, que sí lo llevan; y un guardia
--       que da falsos positivos acaba desactivado, que es peor que no tenerlo:
--       select c.relname, c.relkind
--         from pg_class c join pg_namespace n on n.oid = c.relnamespace
--        where n.nspname = 'public'
--          and (c.relkind = 'm'
--               or (c.relkind = 'v' and coalesce((select lower(option_value)
--                     from pg_options_to_table(c.reloptions)
--                    where option_name = 'security_invoker'), 'false')
--                   not in ('true', 'on')));
--
--    c) Ninguna función ejecutable por anon salvo las dos RPC del RSVP:
--       select p.proname, r.rolname
--         from pg_proc p
--         cross join lateral (values ('anon')) as r(rolname)
--        where p.pronamespace = 'public'::regnamespace
--          and has_function_privilege(r.rolname, p.oid, 'execute')
--          and p.proname not in ('obtener_invitacion', 'registrar_confirmacion',
--                                'anadir_acompanante');
-- ----------------------------------------------------------------------------

commit;
