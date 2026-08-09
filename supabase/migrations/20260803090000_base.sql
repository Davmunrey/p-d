-- ============================================================================
-- 20260803090000_base.sql
-- Tickets: BODA-10 (esquema base y convenciones) · BODA-11 (configuración)
-- Motor:   PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero:
--   1.  Cierra el esquema `public`: revoca los privilegios por defecto que
--       Supabase concede a `anon` y `authenticated` sobre todo objeto nuevo.
--   2.  Instala las extensiones en su propio esquema.
--   3.  Crea las utilidades compartidas por TODO el esquema: sello de
--       `actualizado_en`, normalización de correo, búsqueda sin acentos y el
--       creador idempotente de enumerados.
--   4.  Registro de auditoría con redacción de campos sensibles.
--   5.  Perfiles ligados a `auth.users` + lista blanca de acceso al panel.
--   6.  Configuración de la boda: parte pública y parte privada, separadas.
--   7.  Catálogo de secciones de la landing (visibilidad y orden).
--
-- Invariantes que este fichero deja establecidos y que el resto respeta:
--   · Toda tabla lleva `id uuid`, `creado_en`, `actualizado_en` y RLS activado
--     en la sentencia INMEDIATAMENTE posterior al CREATE TABLE. Nunca existe
--     una tabla, ni un instante, sin RLS.
--   · Una sola función de sello temporal: `public.fijar_actualizado_en()`.
--   · Nombres de restricción `<tabla>_<detalle>`; índices `<tabla>_<detalle>_idx`;
--     claves foráneas `<tabla>_<columna>_fk`.
--   · Ni un identificador en inglés.
--
-- Las políticas RLS viven en 20260803090400_rls.sql. Hasta entonces, RLS
-- activado y sin políticas = denegado para todos, que es el estado seguro.
-- Rollback: supabase/migrations/rollback/20260803090000_base.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Roles de la API
--    En Supabase ya existen. Se crean aquí sólo para que la migración también
--    corra sobre un PostgreSQL limpio (CI, contenedor de pruebas).
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- 1. Cierre del esquema público
--
--    Supabase deja puesto `alter default privileges ... grant all on tables to
--    anon, authenticated`. Eso significa que en el mismo instante del CREATE
--    TABLE, `anon` ya tiene SELECT/INSERT/UPDATE/DELETE/TRUNCATE sobre la tabla
--    y lo único que lo tapa es RLS —que además no se aplica a TRUNCATE—.
--    Se revoca ANTES de crear la primera tabla: así ninguna tabla de este
--    proyecto nace concedida. Los permisos se devuelven uno a uno, y sólo los
--    imprescindibles, en la migración de RLS.
-- ----------------------------------------------------------------------------

do $$
begin
  execute 'alter default privileges in schema public revoke all on tables    from anon, authenticated';
  execute 'alter default privileges in schema public revoke all on sequences from anon, authenticated';
  execute 'alter default privileges in schema public revoke all on functions from anon, authenticated';
  execute 'alter default privileges in schema public revoke execute on functions from public';

  -- Las default privileges son por rol creador: si las migraciones las aplica
  -- `postgres` (lo habitual en Supabase) hay que desactivarlas también ahí.
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'postgres')
     and pg_catalog.pg_has_role(current_user, 'postgres', 'member') then
    execute 'alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated';
    execute 'alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated';
    execute 'alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated';
  end if;
exception
  when insufficient_privilege then
    raise warning 'No se han podido revocar las default privileges del esquema public: %', sqlerrm;
end;
$$;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- El esquema hay que poder recorrerlo para llegar a lo que sí se conceda luego.
grant usage on schema public to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. Extensiones
--    En el esquema `extensions` (convención de Supabase) para no contaminar
--    `public`, que es el que publica la API.
-- ----------------------------------------------------------------------------

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated;

-- `gen_random_bytes` y `digest`: tokens de invitación con entropía criptográfica
-- y su huella SHA-256. (`gen_random_uuid` ya es nativo en PostgreSQL 17.)
create extension if not exists pgcrypto with schema extensions;

-- Búsqueda de invitados tolerante a tildes y a erratas ("Nuñez" halla "Núñez").
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm  with schema extensions;


-- ----------------------------------------------------------------------------
-- 3. Utilidades compartidas
-- ----------------------------------------------------------------------------

-- 3.1 Creación idempotente de enumerados -------------------------------------
-- PostgreSQL no admite `create type if not exists` y las migraciones tienen que
-- poder reaplicarse tras un fallo a mitad. En vez de repetir un bloque DO por
-- cada enumerado en cuatro ficheros, se centraliza aquí.

create or replace function public.asegurar_enum(p_nombre text, p_valores text[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
      from pg_catalog.pg_type t
     where t.typname = p_nombre
       and t.typnamespace = 'public'::regnamespace
  ) then
    return;
  end if;

  execute format(
    'create type public.%I as enum (%s)',
    p_nombre,
    (select string_agg(quote_literal(v), ', ' order by o)
       from unnest(p_valores) with ordinality as u(v, o))
  );
end;
$$;

comment on function public.asegurar_enum(text, text[]) is
  'Crea un enumerado en `public` sólo si no existe. Hace reaplicables las '
  'migraciones: un `supabase db push` que muera a mitad se puede reintentar sin '
  'limpiar tipos a mano en producción, que es justo el momento en el que no se '
  'quiere improvisar SQL. El orden de los valores se respeta porque define el '
  'operador `<` del tipo, y con él el ORDER BY de los listados del panel.';


-- 3.2 Sello de `actualizado_en` ----------------------------------------------
-- UNA sola función para todo el esquema. Todos los triggers que la invocan
-- llevan el mismo `when (old.* is distinct from new.*)`, de modo que la columna
-- significa exactamente lo mismo en las 20 tablas: "cuándo cambió algo de
-- verdad". Un UPDATE idempotente (un formulario que reenvía el objeto entero)
-- no mueve la fecha en ninguna tabla.

create or replace function public.fijar_actualizado_en()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

comment on function public.fijar_actualizado_en() is
  'Trigger BEFORE UPDATE genérico: sella `actualizado_en` en el servidor. La '
  'marca de tiempo nunca se confía al cliente, que puede mentir o traer el reloj '
  'desajustado. Es la ÚNICA función de sello del esquema.';


-- 3.3 Correo electrónico ------------------------------------------------------
-- Se guarda como `text` normalizado a minúsculas por trigger, no como `citext`:
-- así la comparación es la misma en las cinco tablas que guardan correo, no hace
-- falta recordar dónde toca `lower()` y las funciones con `search_path = ''` no
-- dependen de que los operadores de una extensión estén en el path.

create or replace function public.es_correo_valido(p_correo text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_correo is null
      or p_correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$';
$$;

comment on function public.es_correo_valido(text) is
  'Forma mínima de un correo, en un solo sitio. Se usa desde los CHECK de todas '
  'las tablas que guardan correo para que la regla no se escriba cinco veces '
  'con cinco expresiones regulares distintas.';

create or replace function public.normalizar_correo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_columna text := tg_argv[0];
  v_valor   text;
begin
  v_valor := nullif(btrim(lower(to_jsonb(new) ->> v_columna)), '');
  new := jsonb_populate_record(new, jsonb_build_object(v_columna, v_valor));
  return new;
end;
$$;

comment on function public.normalizar_correo() is
  'Trigger BEFORE INSERT/UPDATE: recorta y pasa a minúsculas la columna de correo '
  'que se le indique como argumento. Evita que "Ana@X.com" y "ana@x.com" entren '
  'como dos personas distintas al importar un CSV dos veces.';


-- 3.4 Búsqueda sin acentos ----------------------------------------------------
-- `unaccent()` no es IMMUTABLE (depende del diccionario activo) y por eso no se
-- puede indexar tal cual. La forma con `regdictionary` sí lo es: fija el
-- diccionario en la propia llamada.

create or replace function public.sin_acentos(p_texto text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_texto);
$$;

comment on function public.sin_acentos(text) is
  'Versión indexable de `unaccent`. Es la base de los índices trigrama del '
  'buscador del panel: sin ella, "Nuñez" no encuentra a "Núñez" y cualquier '
  'intento de indexar `unaccent(...)` falla con "must be marked IMMUTABLE".';


-- 3.5 Rutas de Supabase Storage ----------------------------------------------

create or replace function public.es_ruta_almacenamiento_valida(p_ruta text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_ruta is not null
     and p_ruta ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,254}$'
     and p_ruta !~ '\.\.';
$$;

comment on function public.es_ruta_almacenamiento_valida(text) is
  'Ruta relativa dentro del bucket: sin barra inicial y sin `..`. Las políticas '
  'de Storage se apoyan en el prefijo de carpeta, así que una ruta absoluta o con '
  'travesía apuntaría fuera del prefijo esperado. Admite mayúsculas a propósito: '
  '`galeria/DSC_0001.JPG` es una clave perfectamente legal y habitual.';


-- ----------------------------------------------------------------------------
-- 4. Registro de auditoría
-- ----------------------------------------------------------------------------

select public.asegurar_enum('operacion_auditoria',
  array['insercion', 'actualizacion', 'borrado']);

comment on type public.operacion_auditoria is
  'Tipo de operación registrada. En castellano para volcarlo directamente en la '
  'interfaz sin tabla de traducción.';


-- 4.1 Qué campos NO se copian a la bitácora ----------------------------------
-- La auditoría guarda la fila entera en un `jsonb`. RLS filtra filas y los GRANT
-- filtran columnas, pero un jsonb es una sola columna opaca: sin esta lista, la
-- bitácora sería un almacén paralelo de secretos que anula toda restricción de
-- columna aplicada en origen. Es una TABLA y no una lista dentro de la función
-- porque es configuración: añadir un campo sensible no puede exigir migración.

create table if not exists public.campos_auditoria_redactados (
  tabla      text not null,
  columna    text not null,
  motivo     text,
  creado_en  timestamptz not null default now(),

  constraint campos_auditoria_redactados_pk primary key (tabla, columna),
  constraint campos_auditoria_redactados_tabla_no_vacia
    check (length(btrim(tabla)) > 0),
  constraint campos_auditoria_redactados_columna_no_vacia
    check (length(btrim(columna)) > 0)
);
alter table public.campos_auditoria_redactados enable row level security;

comment on table public.campos_auditoria_redactados is
  'Columnas cuyo valor se sustituye por un marcador antes de escribirlo en '
  '`registro_auditoria`. El cambio se sigue detectando (aparece en '
  '`campos_modificados`), pero el valor no queda almacenado por duplicado.';

insert into public.campos_auditoria_redactados (tabla, columna, motivo) values
  ('grupos_invitacion',    'huella_token',        'Credencial de acceso al RSVP.'),
  ('configuracion_privada','iban_regalos',      'Dato bancario de los novios.'),
  ('pagos',                'justificante_ruta', 'Ruta a un justificante bancario.')
on conflict (tabla, columna) do nothing;


-- 4.2 La bitácora ------------------------------------------------------------

create table if not exists public.registro_auditoria (
  id                  uuid not null default gen_random_uuid(),

  esquema             text not null default 'public',
  tabla               text not null,
  registro_id         uuid,
  operacion           public.operacion_auditoria not null,

  datos_anteriores    jsonb,
  datos_nuevos        jsonb,
  campos_modificados  text[] not null default '{}',

  usuario_id          uuid,
  usuario_correo      text,
  origen_cambio       text not null default 'panel',

  creado_en           timestamptz not null default now(),

  constraint registro_auditoria_pk primary key (id),
  constraint registro_auditoria_usuario_id_fk
    foreign key (usuario_id) references auth.users (id) on delete set null,

  constraint registro_auditoria_tabla_no_vacia
    check (length(btrim(tabla)) > 0),

  -- Coherencia de la carga útil: una inserción no puede traer estado anterior,
  -- un borrado no puede traer estado nuevo.
  constraint registro_auditoria_carga_coherente check (
    (operacion = 'insercion'     and datos_anteriores is null     and datos_nuevos is not null) or
    (operacion = 'actualizacion' and datos_anteriores is not null and datos_nuevos is not null) or
    (operacion = 'borrado'       and datos_anteriores is not null and datos_nuevos is null)
  )
);
alter table public.registro_auditoria enable row level security;

comment on table public.registro_auditoria is
  'Bitácora de cambios: quién tocó qué, cuándo y con qué valores. De sólo '
  'inserción: las políticas de BODA-14 no conceden UPDATE ni DELETE a nadie, y '
  'sólo escribe en ella el trigger SECURITY DEFINER. Un histórico que se puede '
  'editar no es un histórico. La lectura está reservada a `propietario`.';

comment on column public.registro_auditoria.tabla is
  'Nombre de la tabla auditada. Texto y no `regclass`: si la tabla se renombra o '
  'se borra, el histórico debe seguir contando lo que pasó entonces.';
comment on column public.registro_auditoria.datos_anteriores is
  'Fila completa antes del cambio, con los campos sensibles redactados según '
  '`campos_auditoria_redactados`. Permite reconstruir un borrado accidental de '
  'invitados a pocas semanas de la boda.';
comment on column public.registro_auditoria.campos_modificados is
  'Columnas realmente distintas en un UPDATE, excluida `actualizado_en`. Se '
  'calcula ANTES de redactar, así que un cambio de token se ve aunque su valor '
  'no se guarde.';
comment on column public.registro_auditoria.usuario_id is
  'Autor del cambio. ON DELETE SET NULL, jamás CASCADE: borrar una cuenta no '
  'puede borrar la traza de lo que esa cuenta hizo.';
comment on column public.registro_auditoria.usuario_correo is
  'Copia congelada del correo en el momento del cambio. Sobrevive al borrado de '
  'la cuenta y hace legible el histórico sin cruzar con `auth.users`.';
comment on column public.registro_auditoria.origen_cambio is
  'De dónde vino la escritura: `panel`, `rsvp:<grupo>` cuando la hizo un invitado '
  'por el enlace público, o `sistema` en migraciones y tareas programadas. Sin '
  'esto, todo lo que entra por una función SECURITY DEFINER llamada con la clave '
  'anónima aparecería como cambio del sistema, porque ahí `auth.uid()` es NULL.';

-- "Histórico de este invitado, del más reciente al más antiguo".
create index if not exists registro_auditoria_registro_idx
  on public.registro_auditoria (tabla, registro_id, creado_en desc);

-- Índice de la clave foránea: sin él, borrar una cuenta escanea la tabla entera.
create index if not exists registro_auditoria_usuario_id_idx
  on public.registro_auditoria (usuario_id);

-- Vista cronológica del panel ("actividad reciente").
create index if not exists registro_auditoria_creado_en_idx
  on public.registro_auditoria (creado_en desc);


-- 4.3 Redacción y trigger genérico -------------------------------------------

create or replace function public.redactar_campos_auditados(p_tabla text, p_datos jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_columna   text;
  v_resultado jsonb := p_datos;
begin
  if p_datos is null then
    return null;
  end if;

  for v_columna in
    select r.columna
      from public.campos_auditoria_redactados as r
     where r.tabla = p_tabla
  loop
    if v_resultado ? v_columna then
      v_resultado := jsonb_set(v_resultado, array[v_columna], '"[redactado]"'::jsonb);
    end if;
  end loop;

  return v_resultado;
end;
$$;

comment on function public.redactar_campos_auditados(text, jsonb) is
  'Sustituye por un marcador los valores de las columnas declaradas sensibles. '
  'La clave se conserva para que el histórico siga siendo legible ("aquí cambió '
  'el token"), pero el secreto no se almacena dos veces.';

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operacion          public.operacion_auditoria;
  v_datos_anteriores   jsonb;
  v_datos_nuevos       jsonb;
  v_campos_modificados text[] := '{}';
  v_registro_id        uuid;
  v_origen             text;
begin
  case tg_op
    when 'INSERT' then
      v_operacion := 'insercion';
      v_datos_nuevos := to_jsonb(new);
    when 'UPDATE' then
      v_operacion := 'actualizacion';
      v_datos_anteriores := to_jsonb(old);
      v_datos_nuevos := to_jsonb(new);
    when 'DELETE' then
      v_operacion := 'borrado';
      v_datos_anteriores := to_jsonb(old);
    else
      raise exception 'Operación no auditable: %', tg_op;
  end case;

  if tg_op = 'UPDATE' then
    -- Se calcula sobre los datos crudos, antes de redactar: un cambio de token
    -- tiene que constar aunque su valor no se guarde.
    select coalesce(array_agg(cambio.campo order by cambio.campo), '{}')
      into v_campos_modificados
      from jsonb_each(v_datos_nuevos) as cambio(campo, valor)
     where cambio.campo <> 'actualizado_en'
       and cambio.valor is distinct from v_datos_anteriores -> cambio.campo;

    -- Un UPDATE que no cambia ningún dato de negocio no es un hecho auditable.
    if cardinality(v_campos_modificados) = 0 then
      return null;
    end if;
  end if;

  v_registro_id := (coalesce(v_datos_nuevos, v_datos_anteriores) ->> 'id')::uuid;

  v_origen := coalesce(
    nullif(btrim(current_setting('boda.origen_cambio', true)), ''),
    case when auth.uid() is null then 'sistema' else 'panel' end
  );

  insert into public.registro_auditoria (
    esquema, tabla, registro_id, operacion,
    datos_anteriores, datos_nuevos, campos_modificados,
    usuario_id, usuario_correo, origen_cambio
  )
  values (
    tg_table_schema,
    tg_table_name,
    v_registro_id,
    v_operacion,
    public.redactar_campos_auditados(tg_table_name, v_datos_anteriores),
    public.redactar_campos_auditados(tg_table_name, v_datos_nuevos),
    v_campos_modificados,
    auth.uid(),
    auth.jwt() ->> 'email',
    v_origen
  );

  return null;  -- Trigger AFTER: el valor de retorno se ignora.
end;
$$;

comment on function public.registrar_auditoria() is
  'Trigger AFTER INSERT/UPDATE/DELETE genérico. Se cuelga de TODAS las tablas de '
  'dominio en 20260803090300_organizacion.sql, cuando ya existen todas. '
  'SECURITY DEFINER a propósito: quien edita una tabla auditada no necesita —ni '
  'debe tener— permiso de escritura sobre el histórico, así nadie puede fabricar '
  'ni suprimir entradas desde la API. Los triggers de fila también se disparan en '
  'los borrados en cascada, de modo que la traza queda completa.';


-- ----------------------------------------------------------------------------
-- 5. Acceso al panel: lista blanca y perfiles
-- ----------------------------------------------------------------------------

select public.asegurar_enum('rol_usuario',
  array['propietario', 'editor', 'lector']);

comment on type public.rol_usuario is
  'Rol de un colaborador del panel. `propietario`: los novios, control total '
  'incluida la gestión de usuarios. `editor`: gestiona datos de la boda pero no '
  'usuarios. `lector`: sólo lectura (wedding planner, familiares que ayudan).';


-- 5.1 Lista blanca ------------------------------------------------------------
-- Sin esto, la única defensa contra "cualquiera con la clave anónima se fabrica
-- una cuenta" sería desactivar el registro con una casilla del panel de
-- Supabase: una casilla que nadie versiona, nadie testea y cualquiera puede
-- volver a activar. La regla 4 del proyecto dice que la seguridad vive en la
-- base de datos, así que vive aquí.

create table if not exists public.invitaciones_panel (
  correo_electronico  text not null,
  rol                 public.rol_usuario not null default 'lector',
  invitado_por        uuid,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),

  constraint invitaciones_panel_pk primary key (correo_electronico),
  constraint invitaciones_panel_correo_valido
    check (public.es_correo_valido(correo_electronico)),
  constraint invitaciones_panel_correo_normalizado
    check (correo_electronico = lower(btrim(correo_electronico)))
);
alter table public.invitaciones_panel enable row level security;

comment on table public.invitaciones_panel is
  'Correos autorizados a entrar en el panel, con el rol que se les concede. Un '
  'alta en `auth.users` cuyo correo NO esté aquí genera un perfil inactivo y sin '
  'permisos: registrarse no concede absolutamente nada. Sólo `propietario` la '
  'gestiona.';

comment on column public.invitaciones_panel.rol is
  'Rol que recibirá la persona al registrarse. Cambiarlo aquí NO altera un perfil '
  'ya creado: para eso está el panel de usuarios, que pasa por '
  '`proteger_privilegios_perfil()`.';

create or replace trigger invitaciones_panel_normalizar_correo
  before insert or update of correo_electronico on public.invitaciones_panel
  for each row execute function public.normalizar_correo('correo_electronico');

create or replace trigger invitaciones_panel_actualizado_en
  before update on public.invitaciones_panel
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();


-- 5.2 Perfiles ----------------------------------------------------------------

create table if not exists public.perfiles (
  id                  uuid not null default gen_random_uuid(),

  usuario_id          uuid not null,

  nombre_completo     text not null,
  correo_electronico  text,
  telefono            text,
  url_avatar          text,

  rol                 public.rol_usuario not null default 'lector',
  activo              boolean not null default false,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),

  constraint perfiles_pk primary key (id),
  constraint perfiles_usuario_id_unico unique (usuario_id),
  constraint perfiles_usuario_id_fk
    foreign key (usuario_id) references auth.users (id) on delete cascade,

  constraint perfiles_nombre_completo_longitud
    check (length(btrim(nombre_completo)) between 1 and 120),
  constraint perfiles_correo_valido
    check (public.es_correo_valido(correo_electronico)),
  constraint perfiles_telefono_formato
    check (telefono is null or telefono ~ '^\+?[0-9][0-9 .()-]{5,19}$'),
  constraint perfiles_url_avatar_formato
    check (url_avatar is null or url_avatar ~ '^https?://')
);
alter table public.perfiles enable row level security;

comment on table public.perfiles is
  'Extiende `auth.users` con los datos de dominio de la aplicación. El esquema '
  '`auth` es propiedad de Supabase y no se toca: rol, nombre visible y alta/baja '
  'viven aquí.';

comment on column public.perfiles.usuario_id is
  'Cuenta de `auth.users` correspondiente. UNIQUE: un perfil por cuenta. '
  'ON DELETE CASCADE porque un perfil sin cuenta no puede iniciar sesión; la '
  'traza de sus cambios queda a salvo en `registro_auditoria`, que usa SET NULL.';
comment on column public.perfiles.correo_electronico is
  'Copia desnormalizada del correo de `auth.users`, mantenida por el trigger '
  '`auth_users_sincronizar_perfil`. Existe para listar colaboradores sin consultar '
  'el esquema `auth` en cada pantalla; la fuente de verdad sigue siendo '
  '`auth.users`, que ya garantiza su unicidad. Por eso aquí el índice NO es único: '
  'un choque de correo abortaría el alta de la cuenta con un 500 opaco.';
comment on column public.perfiles.rol is
  'Autorización real del panel; la interfaz sólo la refleja, las políticas RLS la '
  'aplican. Sólo un `propietario` puede cambiarlo, y lo impide un trigger además '
  'de la política.';
comment on column public.perfiles.activo is
  'Por defecto FALSE. Registrarse no da acceso a nada: hace falta estar en '
  '`invitaciones_panel`. Permite además retirar el acceso a un colaborador sin '
  'borrar su cuenta y, con ella, la legibilidad del histórico.';

create index if not exists perfiles_correo_electronico_idx
  on public.perfiles (correo_electronico)
  where correo_electronico is not null;

-- Filtro habitual: "colaboradores activos que pueden editar".
create index if not exists perfiles_rol_idx
  on public.perfiles (rol)
  where activo;

-- Lo consultan las funciones de rol en cada evaluación de política.
create index if not exists perfiles_usuario_activo_idx
  on public.perfiles (usuario_id)
  where activo;

create or replace trigger perfiles_normalizar_correo
  before insert or update of correo_electronico on public.perfiles
  for each row execute function public.normalizar_correo('correo_electronico');

create or replace trigger perfiles_actualizado_en
  before update on public.perfiles
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();


-- 5.3 Congelar los campos de autorización ------------------------------------
-- `rol` y `activo` viven en la misma fila que el usuario edita para cambiarse el
-- nombre. Sin este trigger, "editar mi perfil" y "hacerme propietario" son la
-- misma operación: es la escalada de privilegios clásica de Supabase. La política
-- RLS lo prohíbe también (cinturón y tirantes), pero una defensa que sólo vive en
-- una política se cae el día que alguien reescribe la política.

create or replace function public.proteger_privilegios_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.rol, new.activo, new.usuario_id)
     is distinct from (old.rol, old.activo, old.usuario_id)
     and not exists (
       select 1
         from public.perfiles as p
        where p.usuario_id = auth.uid()
          and p.rol = 'propietario'
          and p.activo
     )
  then
    raise exception 'PRF01'
      using errcode  = 'insufficient_privilege',
            detail   = format('perfil=%s', old.id),
            hint     = 'Sólo un propietario puede cambiar el rol o el alta de un perfil.';
  end if;

  return new;
end;
$$;

comment on function public.proteger_privilegios_perfil() is
  'Impide que nadie se ascienda a sí mismo. Lanza el código estable PRF01: el '
  'texto visible vive en content/copy.es.json, no incrustado en la base de datos, '
  'y el identificador afectado viaja en DETAIL, que PostgREST no devuelve al '
  'cliente.';

create or replace trigger perfiles_proteger_privilegios
  before update on public.perfiles
  for each row execute function public.proteger_privilegios_perfil();


-- 5.4 Alta automática del perfil ---------------------------------------------

create or replace function public.sincronizar_perfil_desde_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correo    text := nullif(btrim(lower(new.email)), '');
  v_rol       public.rol_usuario;
  v_invitado  boolean := false;
begin
  select i.rol, true
    into v_rol, v_invitado
    from public.invitaciones_panel as i
   where i.correo_electronico = v_correo;

  insert into public.perfiles (usuario_id, correo_electronico, nombre_completo, rol, activo)
  values (
    new.id,
    v_correo,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'nombre_completo'), ''),
      nullif(split_part(coalesce(v_correo, ''), '@', 1), ''),
      'Colaborador ' || left(new.id::text, 8)
    ),
    coalesce(v_rol, 'lector'),
    coalesce(v_invitado, false)
  )
  on conflict (usuario_id) do update
    set correo_electronico = excluded.correo_electronico,
        actualizado_en     = now();
    -- Nunca `rol` ni `activo`: un cambio de correo no reevalúa privilegios.

  return new;
exception
  when others then
    -- Un fallo sincronizando el perfil no puede tumbar el alta de la cuenta:
    -- el trigger es AFTER sobre auth.users y la excepción abortaría toda la
    -- transacción de Supabase Auth, dejando un 500 opaco al usuario.
    raise warning 'No se pudo sincronizar el perfil de %: %', new.id, sqlerrm;
    return new;
end;
$$;

comment on function public.sincronizar_perfil_desde_auth() is
  'Crea el perfil en cuanto nace la cuenta y mantiene el correo al día. El rol y '
  'el alta salen de `invitaciones_panel`: si el correo no está invitado, el perfil '
  'nace `lector` e INACTIVO, y todas las funciones de rol exigen `activo`. '
  'Registrarse con la clave anónima, por tanto, no da acceso a ningún dato. '
  'SECURITY DEFINER porque el registro ocurre antes de que exista sesión alguna.';

create or replace trigger auth_users_sincronizar_perfil
  after insert or update of email on auth.users
  for each row execute function public.sincronizar_perfil_desde_auth();


-- ----------------------------------------------------------------------------
-- 6. Configuración de la boda
--
--    Dos tablas y no una. La landing pública necesita leer fecha, nombres,
--    lugar y coordenadas; RLS filtra filas, no columnas, y aquí sólo hay UNA
--    fila. Mezclar en ella el techo de gasto y el aforo contratado convierte
--    cualquier lectura pública en una filtración comercial frente a los propios
--    proveedores, que también leen la landing. Se separa por diseño:
--    `configuracion_boda` es publicable entera; `configuracion_privada` no sale
--    del panel jamás.
-- ----------------------------------------------------------------------------

-- 6.1 Parte pública ----------------------------------------------------------

create table if not exists public.configuracion_boda (
  id                    uuid not null default gen_random_uuid(),

  -- Centinela que materializa la restricción de fila única.
  fila_unica            boolean not null default true,

  nombre_novia          text not null,
  nombre_novio          text not null,
  hashtag               text,

  fecha_hora_ceremonia  timestamptz not null,
  fecha_hora_banquete   timestamptz,
  zona_horaria          text not null default 'Europe/Madrid',
  fecha_limite_rsvp     timestamptz not null,

  lugar_ceremonia       text,
  direccion_ceremonia   text,
  latitud_ceremonia     numeric(9, 6),
  longitud_ceremonia    numeric(9, 6),

  lugar_banquete        text,
  direccion_banquete    text,
  latitud_banquete      numeric(9, 6),
  longitud_banquete     numeric(9, 6),

  correo_contacto       text,

  moneda                text not null default 'EUR',
  idioma_por_defecto    text not null default 'es',

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now(),

  constraint configuracion_boda_pk primary key (id),

  -- Fila única declarativa: el centinela sólo admite `true` y además es UNIQUE,
  -- luego como mucho puede existir una fila. Una restricción no se esquiva.
  constraint configuracion_boda_fila_unica_valor check (fila_unica),
  constraint configuracion_boda_fila_unica unique (fila_unica),

  constraint configuracion_boda_nombre_novia_longitud
    check (length(btrim(nombre_novia)) between 1 and 80),
  constraint configuracion_boda_nombre_novio_longitud
    check (length(btrim(nombre_novio)) between 1 and 80),
  constraint configuracion_boda_hashtag_formato
    check (hashtag is null or hashtag ~ '^#[[:alnum:]_]{1,60}$'),
  constraint configuracion_boda_zona_horaria_no_vacia
    check (length(btrim(zona_horaria)) > 0),
  constraint configuracion_boda_moneda_iso_4217
    check (moneda ~ '^[A-Z]{3}$'),
  constraint configuracion_boda_idioma_bcp_47
    check (idioma_por_defecto ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  constraint configuracion_boda_correo_contacto_valido
    check (public.es_correo_valido(correo_contacto)),

  constraint configuracion_boda_lugar_ceremonia_longitud
    check (lugar_ceremonia is null or char_length(lugar_ceremonia) <= 160),
  constraint configuracion_boda_lugar_banquete_longitud
    check (lugar_banquete is null or char_length(lugar_banquete) <= 160),
  constraint configuracion_boda_direccion_ceremonia_longitud
    check (direccion_ceremonia is null or char_length(direccion_ceremonia) <= 300),
  constraint configuracion_boda_direccion_banquete_longitud
    check (direccion_banquete is null or char_length(direccion_banquete) <= 300),

  constraint configuracion_boda_latitud_ceremonia_rango
    check (latitud_ceremonia is null or latitud_ceremonia between -90 and 90),
  constraint configuracion_boda_longitud_ceremonia_rango
    check (longitud_ceremonia is null or longitud_ceremonia between -180 and 180),
  constraint configuracion_boda_latitud_banquete_rango
    check (latitud_banquete is null or latitud_banquete between -90 and 90),
  constraint configuracion_boda_longitud_banquete_rango
    check (longitud_banquete is null or longitud_banquete between -180 and 180),

  -- Media coordenada no pinta un mapa: o las dos, o ninguna.
  constraint configuracion_boda_coordenadas_ceremonia_completas
    check ((latitud_ceremonia is null) = (longitud_ceremonia is null)),
  constraint configuracion_boda_coordenadas_banquete_completas
    check ((latitud_banquete is null) = (longitud_banquete is null)),

  constraint configuracion_boda_banquete_posterior_a_ceremonia
    check (fecha_hora_banquete is null or fecha_hora_banquete >= fecha_hora_ceremonia),
  -- Confirmar asistencia el día de la boda no le sirve al catering.
  constraint configuracion_boda_plazo_rsvp_anterior_a_boda
    check (fecha_limite_rsvp < fecha_hora_ceremonia)
);
alter table public.configuracion_boda enable row level security;

comment on table public.configuracion_boda is
  'Fila única con los datos PÚBLICOS de la boda: los que la landing enseña. Es la '
  'única fuente de verdad: ninguna fecha, nombre, lugar ni coordenada puede vivir '
  'en una constante del código. Cambiar la boda de sitio o de día es un UPDATE, no '
  'un despliegue. Toda la fila es publicable; lo que no lo es vive en '
  '`configuracion_privada`.';

comment on column public.configuracion_boda.fila_unica is
  'Centinela de la fila única: CHECK obliga a `true` y UNIQUE impide una segunda '
  'fila. No tiene significado de negocio y no se muestra.';
comment on column public.configuracion_boda.fecha_hora_ceremonia is
  'Instante exacto de inicio, con zona horaria. `timestamptz` y no `date` + `time` '
  'para que la cuenta atrás sea correcta también para quien la abre desde otro '
  'país o con el móvil en otro huso.';
comment on column public.configuracion_boda.zona_horaria is
  'Huso IANA con el que se formatean fechas en la interfaz y en los correos. Se '
  'guarda aparte del instante porque "las 12:00 en la finca" es lo que hay que '
  'enseñar, sea cual sea el navegador del invitado.';
comment on column public.configuracion_boda.fecha_limite_rsvp is
  'Cierre del plazo de confirmación. Lo aplica `public.registrar_confirmacion()` '
  'comparando siempre contra `now()`, nunca contra una fecha que mande el cliente: '
  'el límite se cumple en la base de datos, no ocultando un botón en el navegador.';
comment on column public.configuracion_boda.latitud_ceremonia is
  '`numeric` y no `float`: la precisión de una coordenada es exacta y no debe '
  'depender del redondeo binario. Seis decimales ≈ 11 cm, de sobra para un mapa.';
comment on column public.configuracion_boda.moneda is
  'Código ISO 4217 con el que se formatea todo el presupuesto.';
comment on column public.configuracion_boda.idioma_por_defecto is
  'Idioma de la landing y de los correos cuando el grupo de invitación no indica '
  'otro (BCP 47). Es también el idioma que `medios` exige en el texto alternativo.';


-- 6.2 Parte privada ----------------------------------------------------------

create table if not exists public.configuracion_privada (
  id                    uuid not null default gen_random_uuid(),
  fila_unica            boolean not null default true,

  presupuesto_objetivo  numeric(12, 2),
  aforo_maximo          integer,
  telefono_contacto     text,
  iban_regalos          text,
  notas_privadas        text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now(),

  constraint configuracion_privada_pk primary key (id),
  constraint configuracion_privada_fila_unica_valor check (fila_unica),
  constraint configuracion_privada_fila_unica unique (fila_unica),

  constraint configuracion_privada_presupuesto_no_negativo
    check (presupuesto_objetivo is null or presupuesto_objetivo >= 0),
  constraint configuracion_privada_aforo_maximo_rango
    check (aforo_maximo is null or aforo_maximo between 1 and 5000),
  constraint configuracion_privada_telefono_formato
    check (telefono_contacto is null or telefono_contacto ~ '^\+?[0-9][0-9 .()-]{5,19}$'),
  constraint configuracion_privada_iban_formato
    check (iban_regalos is null or iban_regalos ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  constraint configuracion_privada_notas_longitud
    check (notas_privadas is null or char_length(notas_privadas) <= 4000)
);
alter table public.configuracion_privada enable row level security;

comment on table public.configuracion_privada is
  'Fila única con lo que NUNCA sale del panel: techo de gasto, aforo contratado, '
  'teléfono de los novios y cuenta para los regalos. Separada de '
  '`configuracion_boda` porque RLS filtra filas y no columnas: con una sola tabla, '
  'la política de lectura pública que necesita la landing expondría la fila entera.';

comment on column public.configuracion_privada.presupuesto_objetivo is
  'Techo de gasto previsto, contra el que se compara `v_resumen_presupuesto`. '
  'Información comercialmente sensible frente a los propios proveedores.';
comment on column public.configuracion_privada.aforo_maximo is
  'Tope de comensales que admite la finca. El panel avisa cuando las '
  'confirmaciones se acercan al límite.';


-- 6.3 La fila de configuración no se borra -----------------------------------
-- La restricción de fila única garantiza COMO MUCHO una fila, nunca AL MENOS
-- una. Sin esto, la cardinalidad real es 0..1: un DELETE desde el panel deja la
-- landing sin fecha ni nombres, y como la regla 1 prohíbe valores por defecto en
-- el código, la portada revienta en el primer render.

create or replace function public.impedir_borrado_configuracion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'CFG01'
    using errcode = 'restrict_violation',
          hint    = 'La configuración de la boda no se borra: se edita.';
end;
$$;

comment on function public.impedir_borrado_configuracion() is
  'Convierte la cardinalidad 0..1 de la configuración en exactamente 1. La fila '
  'la siembra esta misma migración y ya no se puede eliminar.';

create or replace trigger configuracion_boda_no_borrar
  before delete on public.configuracion_boda
  for each row execute function public.impedir_borrado_configuracion();

create or replace trigger configuracion_privada_no_borrar
  before delete on public.configuracion_privada
  for each row execute function public.impedir_borrado_configuracion();

create or replace trigger configuracion_boda_normalizar_correo
  before insert or update of correo_contacto on public.configuracion_boda
  for each row execute function public.normalizar_correo('correo_contacto');

create or replace trigger configuracion_boda_actualizado_en
  before update on public.configuracion_boda
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();

create or replace trigger configuracion_privada_actualizado_en
  before update on public.configuracion_privada
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();

-- Semilla idempotente. Valores deliberadamente evidentes: la boda real se
-- configura desde el panel, nunca desde una migración.
insert into public.configuracion_boda (
  nombre_novia, nombre_novio, fecha_hora_ceremonia, fecha_limite_rsvp
)
values (
  'Por definir',
  'Por definir',
  date_trunc('day', now()) + interval '1 year',
  date_trunc('day', now()) + interval '10 months'
)
on conflict (fila_unica) do nothing;

insert into public.configuracion_privada (fila_unica)
values (true)
on conflict (fila_unica) do nothing;


-- ----------------------------------------------------------------------------
-- 7. Secciones de la landing
--
--    Un solo vocabulario. Antes esto vivía dos veces —un enumerado para las
--    fotos y nueve columnas `mostrar_*` en la configuración— con nombres que no
--    casaban entre sí ("lugar" frente a "ubicaciones", "regalo" frente a
--    "regalos") y secciones que existían en una lista y no en la otra. Con dos
--    listas paralelas, el frontend necesita un diccionario de traducción a mano:
--    exactamente el hardcode que prohíbe la regla 1.
-- ----------------------------------------------------------------------------

select public.asegurar_enum('seccion_landing', array[
  'portada',
  'reserva_la_fecha',
  'cuenta_atras',
  'historia',
  'galeria',
  'ubicaciones',
  'transporte',
  'alojamiento',
  'regalos',
  'preguntas_frecuentes',
  'rsvp'
]);

comment on type public.seccion_landing is
  'Secciones que puede tener la landing. Es un enumerado y no texto libre porque '
  'el frontend tiene un componente por sección: un valor desconocido no se sabría '
  'pintar, y fallar en la base de datos es mejor que fallar en el render. Su '
  'visibilidad y su orden se configuran en `public.secciones_landing`.';

create table if not exists public.secciones_landing (
  seccion         public.seccion_landing not null,
  visible         boolean not null default true,
  orden           smallint not null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  constraint secciones_landing_pk primary key (seccion),
  constraint secciones_landing_orden_no_negativo check (orden >= 0),
  -- DEFERRABLE para poder permutar dos secciones en una sola transacción sin
  -- pasar por valores intermedios ficticios.
  constraint secciones_landing_orden_unico unique (orden) deferrable initially deferred
);
alter table public.secciones_landing enable row level security;

comment on table public.secciones_landing is
  'Qué secciones se enseñan en la landing y en qué orden. Sustituye a las nueve '
  'columnas `mostrar_*`: añadir una sección es una fila, no una migración de '
  'esquema más un despliegue de frontend.';

create index if not exists secciones_landing_visibles_idx
  on public.secciones_landing (orden)
  where visible;

create or replace trigger secciones_landing_actualizado_en
  before update on public.secciones_landing
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();

insert into public.secciones_landing (seccion, visible, orden) values
  ('portada',              true,   0),
  ('cuenta_atras',         true,  10),
  ('historia',             true,  20),
  ('galeria',              true,  30),
  ('ubicaciones',          true,  40),
  ('transporte',           true,  50),
  ('alojamiento',          true,  60),
  ('preguntas_frecuentes', true,  70),
  ('rsvp',                 true,  80),
  ('reserva_la_fecha',     false, 90),
  -- Apagada por defecto: la sección de regalos es delicada y se publica sólo
  -- cuando los novios lo deciden expresamente.
  ('regalos',              false, 100)
on conflict (seccion) do nothing;


-- ----------------------------------------------------------------------------
-- 8. Cierre de permisos sobre las funciones creadas aquí
--    `revoke ... from public` NO basta en Supabase: las default privileges
--    conceden EXECUTE explícitamente a `anon` y `authenticated`, que no son el
--    pseudo-rol PUBLIC. Hay que nombrarlos.
-- ----------------------------------------------------------------------------

revoke execute on function public.asegurar_enum(text, text[])                  from public, anon, authenticated;
revoke execute on function public.fijar_actualizado_en()                       from public, anon, authenticated;
revoke execute on function public.normalizar_correo()                          from public, anon, authenticated;
revoke execute on function public.sin_acentos(text)                            from public, anon, authenticated;
revoke execute on function public.es_correo_valido(text)                       from public, anon, authenticated;
revoke execute on function public.es_ruta_almacenamiento_valida(text)          from public, anon, authenticated;
revoke execute on function public.redactar_campos_auditados(text, jsonb)       from public, anon, authenticated;
revoke execute on function public.registrar_auditoria()                        from public, anon, authenticated;
revoke execute on function public.proteger_privilegios_perfil()                from public, anon, authenticated;
revoke execute on function public.sincronizar_perfil_desde_auth()              from public, anon, authenticated;
revoke execute on function public.impedir_borrado_configuracion()              from public, anon, authenticated;

-- Excepción medida y comprobada: PostgreSQL SÍ exige EXECUTE sobre las funciones
-- que aparecen en un CHECK o en una expresión de índice, y las comprueba en cada
-- INSERT/UPDATE del rol que escribe. Sin estas tres concesiones, un editor no
-- podría dar de alta un invitado ("permission denied for function
-- es_correo_valido"). Son funciones puras e inmutables que no leen ninguna tabla
-- y no revelan nada: conceder EXECUTE no amplía la superficie de ataque.
-- `anon` queda fuera a propósito: no tiene INSERT ni UPDATE sobre ninguna tabla,
-- así que nunca llega a evaluarlas.
grant execute on function public.es_correo_valido(text)              to authenticated;
grant execute on function public.es_ruta_almacenamiento_valida(text) to authenticated;
grant execute on function public.sin_acentos(text)                   to authenticated;

commit;
