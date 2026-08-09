-- ============================================================================
-- 20260803090100_invitados.sql
-- Ticket: BODA-12 (invitados, grupos de invitación y confirmaciones)
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero:
--   El núcleo del RSVP. La unidad de invitación (un grupo, con su token), las
--   personas que la componen y el historial de respuestas.
--
-- Tres decisiones que gobiernan todo el bloque:
--
--   1. El token NO se guarda en claro. Se guarda su SHA-256. El texto plano
--      existe una sola vez, en el enlace que se manda al invitado. Un token en
--      claro convierte cualquier lectura de más sobre esta tabla —una política
--      mal escrita, la propia bitácora, un volcado— en el compromiso simultáneo
--      de los 150 enlaces de la boda, no de uno.
--
--   2. Las notas privadas de los novios viven en OTRAS tablas
--      (`notas_grupo`, `notas_invitado`). RLS es control de fila, no de columna,
--      y la ruta pública del RSVP tiene que poder alcanzar `grupos_invitacion` e
--      `invitados`. Lo que no puede leer el invitado, sencillamente no está ahí.
--
--   3. Los invariantes de negocio con impacto económico —plazo de RSVP y tope de
--      acompañantes— se defienden con triggers, no con un `if` en una función de
--      aplicación. Regla 4 del proyecto.
--
-- Las políticas RLS viven en 20260803090400_rls.sql.
-- Rollback: supabase/migrations/rollback/20260803090100_invitados.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Tipos enumerados
--    El orden de declaración fija el operador `<` del tipo, así que se declara
--    en el orden en que queremos ver los valores en los listados del panel.
-- ----------------------------------------------------------------------------

select public.asegurar_enum('lado_invitacion', array['novia', 'novio', 'ambos']);

comment on type public.lado_invitacion is
  'De qué parte viene la invitación. Sirve para repartir mesas y para las '
  'estadísticas del panel.';

select public.asegurar_enum('evento_boda', array['ceremonia', 'banquete', 'fiesta']);

comment on type public.evento_boda is
  'Eventos a los que se puede invitar por separado: hay gente invitada sólo a la '
  'ceremonia o sólo a la fiesta.';

select public.asegurar_enum('tipo_menu', array[
  'estandar', 'vegetariano', 'vegano', 'infantil', 'sin_gluten', 'otro'
]);

comment on type public.tipo_menu is
  'Menú que se comunica al catering. `otro` obliga a detallar en `alergias`.';

select public.asegurar_enum('estado_confirmacion', array[
  'pendiente', 'tentativo', 'confirmado', 'rechazado'
]);

comment on type public.estado_confirmacion is
  'Estado del RSVP de un invitado. Orden de declaración = orden del embudo (sin '
  'respuesta → respuesta firme), para que ORDER BY estado sea legible. '
  '`tentativo` existe porque mucha gente contesta "casi seguro" y conviene no '
  'contarlo como confirmado.';

select public.asegurar_enum('origen_confirmacion', array['publico', 'panel', 'sistema']);

comment on type public.origen_confirmacion is
  'Quién registró la respuesta: el propio invitado desde /rsvp/[token] '
  '(`publico`), los novios a mano tras una llamada (`panel`), o el alta '
  'automática de la fila inicial (`sistema`).';


-- ----------------------------------------------------------------------------
-- 2. Tokens de invitación
-- ----------------------------------------------------------------------------

create or replace function public.generar_token_invitacion()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
$$;

comment on function public.generar_token_invitacion() is
  'Genera el token del enlace público de RSVP: 24 bytes (192 bits) aleatorios en '
  'base64 "url-safe", 32 caracteres sin +, / ni =, para que viaje limpio en '
  '/rsvp/[token] y dentro de un QR. Es la única credencial del invitado, así que '
  'no puede ser corto ni predecible; un uuid sería adivinable en formato y corto '
  'para este uso.';

create or replace function public.huella_token(p_token text)
returns bytea
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select extensions.digest(p_token, 'sha256');
$$;

comment on function public.huella_token(text) is
  'SHA-256 del token. Es lo ÚNICO que se guarda en la base de datos: la tabla '
  'nunca contiene la credencial en claro, de modo que ni un volcado ni una '
  'política de lectura mal escrita entregan enlaces utilizables.';


-- ----------------------------------------------------------------------------
-- 3. Grupos de invitación
-- ----------------------------------------------------------------------------

create table if not exists public.grupos_invitacion (
  id                  uuid not null default gen_random_uuid(),

  nombre              text not null,

  -- Sin valor por defecto utilizable a propósito: el enlace se emite con
  -- `public.rotar_token_invitacion()`, que es quien devuelve el texto plano una
  -- única vez. Un grupo recién creado tiene una huella aleatoria que no
  -- corresponde a ningún token conocido, es decir: no se puede entrar con él.
  huella_token        bytea not null default public.huella_token(public.generar_token_invitacion()),
  token_emitido_en    timestamptz,

  maximo_acompanantes smallint not null default 0,
  lado                public.lado_invitacion not null default 'ambos',
  invitado_a          public.evento_boda[] not null
                        default array['ceremonia', 'banquete', 'fiesta']::public.evento_boda[],

  -- Dirección postal desglosada: se usa para el envío físico de invitaciones, y
  -- en un solo campo de texto libre no hay forma de ordenar ni de exportar.
  direccion           text,
  codigo_postal       text,
  ciudad              text,
  provincia           text,
  pais                text,

  idioma              text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),

  constraint grupos_invitacion_pk primary key (id),
  constraint grupos_invitacion_huella_token_unico unique (huella_token),

  constraint grupos_invitacion_nombre_longitud
    check (btrim(nombre) <> '' and char_length(nombre) <= 120),

  constraint grupos_invitacion_maximo_acompanantes_rango
    check (maximo_acompanantes between 0 and 20),

  -- Al menos un evento y sin NULL dentro del array. La cota superior NO se
  -- escribe a mano: el número de eventos es un dato derivable del enumerado y
  -- copiarlo aquí obligaría a tocar el CHECK cada vez que se añada un evento.
  -- La ausencia de duplicados la garantiza el trigger de normalización.
  constraint grupos_invitacion_eventos_no_vacio
    check (cardinality(invitado_a) >= 1 and array_position(invitado_a, null) is null),

  constraint grupos_invitacion_codigo_postal_formato
    check (codigo_postal is null or codigo_postal ~ '^[0-9A-Za-z .-]{3,12}$'),
  constraint grupos_invitacion_idioma_bcp_47
    check (idioma is null or idioma ~ '^[a-z]{2}(-[A-Z]{2})?$'),

  -- Campos que el propio invitado puede corregir desde el formulario público:
  -- se acotan para que un POST no pueda inflar la tabla.
  constraint grupos_invitacion_direccion_longitud
    check (direccion is null or char_length(direccion) <= 200),
  constraint grupos_invitacion_codigo_postal_longitud
    check (codigo_postal is null or char_length(codigo_postal) <= 12),
  constraint grupos_invitacion_ciudad_longitud
    check (ciudad is null or char_length(ciudad) <= 80),
  constraint grupos_invitacion_provincia_longitud
    check (provincia is null or char_length(provincia) <= 80),
  constraint grupos_invitacion_pais_longitud
    check (pais is null or char_length(pais) <= 80)
);
alter table public.grupos_invitacion enable row level security;

comment on table public.grupos_invitacion is
  'Unidad de invitación: una familia o una pareja. Es lo que recibe un enlace y lo '
  'que responde al RSVP; las personas concretas cuelgan de aquí.';

comment on column public.grupos_invitacion.nombre is
  'Cómo se dirige uno al grupo en la invitación: "Familia Pérez Gómez", "Ana y '
  'Luis". No es un nombre de persona.';
comment on column public.grupos_invitacion.huella_token is
  'SHA-256 del secreto que da acceso a /rsvp/[token]. Lo resuelve '
  '`public.obtener_invitacion()`. El texto plano NO se almacena: se devuelve una '
  'sola vez, al emitirlo con `public.rotar_token_invitacion()`.';
comment on column public.grupos_invitacion.token_emitido_en is
  'Cuándo se emitió el enlace vigente. NULL = el grupo existe pero todavía no '
  'tiene enlace utilizable. Sirve para saber a quién falta mandarle la invitación.';
comment on column public.grupos_invitacion.maximo_acompanantes is
  'Plazas extra que el grupo puede añadir por su cuenta al confirmar (0 = lista '
  'cerrada). El tope lo garantiza el trigger `invitados_validar_aforo_grupo`, no '
  'la aplicación.';
comment on column public.grupos_invitacion.invitado_a is
  'Eventos a los que está invitado el grupo. Array y no tres booleanos porque la '
  'landing y los correos iteran sobre la lista tal cual. Se normaliza (sin '
  'duplicados y ordenado) en un trigger.';
comment on column public.grupos_invitacion.idioma is
  'Idioma preferido del grupo en BCP 47 (es, en, ca). NULL = usar '
  '`public.configuracion_boda.idioma_por_defecto`, para no duplicar el idioma '
  'general en cada fila.';

-- El índice único de `huella_token` resuelve la búsqueda de `obtener_invitacion()`:
-- es la consulta más caliente de la parte pública y tiene que ser index scan.

create index if not exists grupos_invitacion_lado_idx
  on public.grupos_invitacion (lado);

-- GIN sobre el array: "quién está invitado a la fiesta" sin recorrer la tabla.
create index if not exists grupos_invitacion_eventos_idx
  on public.grupos_invitacion using gin (invitado_a);

-- Buscador del panel, tolerante a tildes y erratas.
create index if not exists grupos_invitacion_nombre_trgm_idx
  on public.grupos_invitacion using gin (public.sin_acentos(nombre) extensions.gin_trgm_ops);


-- 3.1 Normalización de los eventos -------------------------------------------
-- Ni la cardinalidad ni `<@` impiden repeticiones: array['fiesta','fiesta'] pasa
-- cualquier CHECK razonable. Y sin orden canónico, dos grupos con la misma
-- invitación guardan arrays distintos e incomparables. Se normaliza en un
-- trigger porque un CHECK no admite subconsultas.

create or replace function public.normalizar_eventos_grupo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.invitado_a := array(
    select distinct e from unnest(new.invitado_a) as e order by e
  );
  return new;
end;
$$;

comment on function public.normalizar_eventos_grupo() is
  'Deduplica y ordena `invitado_a`. Sin esto, un PATCH mal construido guarda '
  '{banquete,banquete}: la invitación enseña "Banquete" dos veces y el grupo '
  'desaparece del listado de la fiesta sin que nada haya fallado.';

create or replace trigger grupos_invitacion_normalizar_eventos
  before insert or update of invitado_a on public.grupos_invitacion
  for each row execute function public.normalizar_eventos_grupo();


-- 3.2 Congelar los campos de autorización ------------------------------------
-- `invitado_a`, `maximo_acompanantes`, `lado` y el token no son datos: son
-- privilegios. Definen a cuántos eventos entra el grupo y cuántas personas puede
-- añadir. Viven en una tabla que la ruta pública necesita poder actualizar
-- (dirección e idioma al confirmar), así que se congelan explícitamente. Un
-- `with check` de RLS sobre el token no ayuda: comprueba que la fila sigue
-- siendo la suya, no que no se haya ascendido a sí misma.

create or replace function public.congelar_privilegios_grupo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.huella_token, new.invitado_a, new.maximo_acompanantes, new.lado)
     is distinct from
     (old.huella_token, old.invitado_a, old.maximo_acompanantes, old.lado)
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
  'Impide que el propio invitado se cuele en más eventos, se suba el cupo de '
  'acompañantes o reescriba su token dejando al grupo real fuera de su enlace. '
  'Dentro de las funciones públicas del RSVP `auth.uid()` es NULL, luego '
  '`puede_editar()` es falso y las cuatro columnas quedan congeladas.';

create or replace trigger grupos_invitacion_congelar_privilegios
  before update on public.grupos_invitacion
  for each row execute function public.congelar_privilegios_grupo();

create or replace trigger grupos_invitacion_actualizado_en
  before update on public.grupos_invitacion
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();


-- 3.3 Notas privadas del grupo ------------------------------------------------

create table if not exists public.notas_grupo (
  grupo_id        uuid not null,
  texto           text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  constraint notas_grupo_pk primary key (grupo_id),
  constraint notas_grupo_grupo_id_fk
    foreign key (grupo_id) references public.grupos_invitacion (id) on delete cascade,
  constraint notas_grupo_texto_longitud
    check (texto is null or char_length(texto) <= 2000)
);
alter table public.notas_grupo enable row level security;

comment on table public.notas_grupo is
  'Notas privadas de los novios sobre un grupo ("los primos de Madrid, mesa lejos '
  'de la música"). Tabla aparte y no columna de `grupos_invitacion`: la ruta '
  'pública del RSVP tiene que leer el grupo, y lo que el invitado no debe ver no '
  'puede estar en la fila que se le devuelve. Nunca la toca ninguna función '
  'pública.';

create or replace trigger notas_grupo_actualizado_en
  before update on public.notas_grupo
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();


-- ----------------------------------------------------------------------------
-- 4. Invitados
-- ----------------------------------------------------------------------------

create table if not exists public.invitados (
  id                  uuid not null default gen_random_uuid(),

  grupo_id            uuid not null,

  -- La clave foránea a `public.mesas` se ata en 20260803090300_organizacion.sql,
  -- que es donde nace la tabla referenciada. La COLUMNA se declara aquí, donde
  -- nace la tabla que la contiene: repartir la responsabilidad entre dos ficheros
  -- es cómo se acaba con una columna que no crea nadie.
  mesa_id             uuid,

  nombre              text not null,
  apellidos           text,

  -- Columna real mantenida por trigger, y NO `generated always as ... stored`.
  -- Motivo: PostgreSQL prohíbe `when (old.* is distinct from new.*)` en un
  -- trigger BEFORE de una tabla con columnas generadas ("BEFORE trigger's WHEN
  -- condition cannot reference NEW generated columns"). Sin esa cláusula, esta
  -- tabla —y sólo ésta— movería `actualizado_en` en UPDATEs que no cambian nada,
  -- y la columna dejaría de significar lo mismo en todo el esquema. El valor lo
  -- sigue poniendo la base de datos en cada INSERT/UPDATE, nunca el cliente.
  nombre_completo     text not null default '',

  correo_electronico  text,
  telefono            text,

  es_nino             boolean not null default false,
  es_acompanante      boolean not null default false,

  tipo_menu           public.tipo_menu not null default 'estandar',
  alergias            text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),

  constraint invitados_pk primary key (id),

  -- ON DELETE CASCADE: un invitado no tiene existencia propia fuera de su grupo.
  -- RESTRICT obligaría a un borrado manual en dos pasos y SET NULL dejaría
  -- exactamente los huérfanos que queremos evitar. La traza del borrado queda en
  -- `registro_auditoria`, que también audita las cascadas.
  constraint invitados_grupo_id_fk
    foreign key (grupo_id) references public.grupos_invitacion (id) on delete cascade,

  constraint invitados_nombre_longitud
    check (btrim(nombre) <> '' and char_length(nombre) between 1 and 80),
  constraint invitados_apellidos_longitud
    check (apellidos is null or char_length(apellidos) <= 120),

  constraint invitados_correo_valido
    check (public.es_correo_valido(correo_electronico)),
  constraint invitados_telefono_formato
    check (telefono is null or telefono ~ '^\+?[0-9 ().-]{6,25}$'),

  -- Implicación en UN solo sentido. La equivalencia estricta
  -- `(tipo_menu = 'infantil') = es_nino` hacía imposible registrar a un niño
  -- celíaco, vegano o vegetariano: la única salida era marcarlo como adulto
  -- (descuadrando trona, autobús y espacio infantil) o darle gluten. El menú
  -- infantil sigue siendo exclusivo de menores; el recuento de niños se hace por
  -- `es_nino`, que es el dato fiable, no por `tipo_menu`.
  constraint invitados_menu_infantil_solo_ninos
    check (tipo_menu <> 'infantil' or es_nino),

  constraint invitados_alergias_longitud
    check (alergias is null or char_length(alergias) <= 500)
);
alter table public.invitados enable row level security;

comment on table public.invitados is
  'Persona concreta dentro de un grupo de invitación. Es la unidad que confirma, '
  'que come un menú y que se sienta en una mesa.';

comment on column public.invitados.grupo_id is
  'Grupo al que pertenece. ON DELETE CASCADE: borrar el grupo borra a sus '
  'invitados, nunca los deja huérfanos.';
comment on column public.invitados.mesa_id is
  'Mesa asignada en el plano del banquete. NULL = todavía sin sentar. La clave '
  'foránea (ON DELETE SET NULL) se ata en la migración de organización: quitar '
  'una mesa del plano devuelve a su gente a la bolsa de "sin mesa", jamás la '
  'borra.';
comment on column public.invitados.nombre_completo is
  'Nombre y apellidos ya compuestos, para listar, ordenar y buscar sin '
  'recomponerlos en cada consulta ni en el frontend. Lo mantiene el trigger '
  '`invitados_componer_nombre_completo`: lo que mande el cliente en esta columna '
  'se descarta siempre.';
comment on column public.invitados.correo_electronico is
  'Puede repetirse dentro de un grupo (una pareja que comparte buzón), por eso no '
  'lleva índice único. Se normaliza a minúsculas por trigger para que reimportar '
  'un CSV no duplique personas.';
comment on column public.invitados.es_nino is
  'Marca a los menores: cuentan aparte para el catering, el autobús y el espacio '
  'infantil. Es el dato con el que se hacen los recuentos, no `tipo_menu`.';
comment on column public.invitados.es_acompanante is
  'La persona la añadió el grupo al confirmar y consume una plaza de '
  '`maximo_acompanantes`.';
comment on column public.invitados.alergias is
  'Alergias e intolerancias en texto libre. Lo escribe el invitado desde el RSVP, '
  'de ahí el límite de longitud. Dato de salud (art. 9 RGPD): no sale nunca de la '
  'invitación de su propio grupo.';

-- Índice de la clave foránea: sin él, tanto los JOIN del panel como el propio
-- ON DELETE CASCADE recorren la tabla entera.
create index if not exists invitados_grupo_id_idx
  on public.invitados (grupo_id);

create index if not exists invitados_nombre_completo_idx
  on public.invitados (nombre_completo);

-- Buscador del panel: `ilike '%algo%'` no puede usar un btree, y el btree plano
-- tampoco cumple la promesa de las tildes con la que se instaló `unaccent`.
create index if not exists invitados_nombre_trgm_idx
  on public.invitados using gin (public.sin_acentos(nombre_completo) extensions.gin_trgm_ops);

-- Parcial: la mayoría de invitados no tiene correo y sólo interesa buscar por él
-- cuando existe (recordatorios, deduplicado en la importación CSV).
create index if not exists invitados_correo_electronico_idx
  on public.invitados (correo_electronico)
  where correo_electronico is not null;

create index if not exists invitados_tipo_menu_idx
  on public.invitados (tipo_menu);

create or replace function public.componer_nombre_completo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.nombre_completo := btrim(new.nombre || ' ' || coalesce(new.apellidos, ''));
  return new;
end;
$$;

comment on function public.componer_nombre_completo() is
  'Mantiene `invitados.nombre_completo` a partir de nombre y apellidos. Se ejecuta '
  'en cada INSERT y en cada UPDATE de esas dos columnas, de modo que el valor es '
  'siempre derivado y el cliente no lo puede falsear.';

create or replace trigger invitados_componer_nombre_completo
  before insert or update of nombre, apellidos on public.invitados
  for each row execute function public.componer_nombre_completo();

create or replace trigger invitados_normalizar_correo
  before insert or update of correo_electronico on public.invitados
  for each row execute function public.normalizar_correo('correo_electronico');

create or replace trigger invitados_actualizado_en
  before update on public.invitados
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();


-- 4.1 Notas privadas de la persona -------------------------------------------

create table if not exists public.notas_invitado (
  invitado_id     uuid not null,
  texto           text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  constraint notas_invitado_pk primary key (invitado_id),
  constraint notas_invitado_invitado_id_fk
    foreign key (invitado_id) references public.invitados (id) on delete cascade,
  constraint notas_invitado_texto_longitud
    check (texto is null or char_length(texto) <= 2000)
);
alter table public.notas_invitado enable row level security;

comment on table public.notas_invitado is
  'Notas privadas de los novios sobre una persona. Fuera de `invitados` por el '
  'mismo motivo que `notas_grupo`: la ruta pública lee `invitados`.';

create or replace trigger notas_invitado_actualizado_en
  before update on public.notas_invitado
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();


-- 4.2 Tope de acompañantes ----------------------------------------------------
-- El único control anterior era `check (maximo_acompanantes between 0 and 20)`,
-- que acota el campo pero no cuenta nada. Contarlo en la función de aplicación
-- deja una carrera ganable: en READ COMMITTED, treinta llamadas concurrentes
-- leen todas `count(*) = 0`, todas pasan la validación y todas insertan. Con un
-- aforo cerrado con la finca, eso es coste real.

create or replace function public.invitados_validar_aforo_grupo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_maximo    smallint;
  v_ocupadas  bigint;
begin
  -- El bloqueo de la fila padre es el punto de serialización natural: dos altas
  -- del mismo grupo se ordenan, y el recuento de la segunda ya ve a la primera.
  select g.maximo_acompanantes
    into v_maximo
    from public.grupos_invitacion as g
   where g.id = new.grupo_id
     for update;

  select count(*)
    into v_ocupadas
    from public.invitados as i
   where i.grupo_id = new.grupo_id
     and i.es_acompanante;

  if v_ocupadas > coalesce(v_maximo, 0) then
    raise exception 'RSV05'
      using errcode = 'check_violation',
            detail  = format('grupo=%s maximo=%s ocupadas=%s',
                             new.grupo_id, coalesce(v_maximo, 0), v_ocupadas),
            hint    = 'El grupo ha agotado sus plazas de acompañante.';
  end if;

  return null;
end;
$$;

comment on function public.invitados_validar_aforo_grupo() is
  'Garantiza en la base de datos el tope de acompañantes de cada grupo, pase la '
  'escritura por donde pase: formulario público, alta manual del panel, '
  'importación CSV o `service_role`. Es un CONSTRAINT TRIGGER para poder contar '
  'después de la sentencia (y no fila a fila), y bloquea el grupo para que el '
  'recuento no sea una carrera.';

drop trigger if exists invitados_aforo_grupo on public.invitados;
create constraint trigger invitados_aforo_grupo
  after insert or update of grupo_id, es_acompanante on public.invitados
  deferrable initially immediate
  for each row execute function public.invitados_validar_aforo_grupo();


-- ----------------------------------------------------------------------------
-- 5. Confirmaciones de asistencia (histórico, sólo inserción)
--    Cada respuesta es una fila nueva y la anterior deja de ser vigente. Así se
--    ve quién cambió de opinión y cuándo, algo que importa cuando el catering ya
--    tiene un número cerrado.
-- ----------------------------------------------------------------------------

create table if not exists public.confirmaciones (
  id                    uuid not null default gen_random_uuid(),

  invitado_id           uuid not null,

  estado                public.estado_confirmacion not null default 'pendiente',

  -- Por defecto el origen MENOS fiable. Con `panel` por defecto, un INSERT que
  -- se olvide de fijarlo queda registrado como si lo hubiera tecleado un novio.
  origen                public.origen_confirmacion not null default 'publico',

  respondido_en         timestamptz,
  necesita_autobus      boolean,
  necesita_alojamiento  boolean,
  cancion_solicitada    text,
  mensaje               text,

  registrado_por        uuid,

  es_vigente            boolean not null default true,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now(),

  constraint confirmaciones_pk primary key (id),

  -- ON DELETE CASCADE: la respuesta no significa nada sin la persona, y borrar a
  -- un invitado (derecho de supresión del RGPD) tiene que llevarse sus datos.
  constraint confirmaciones_invitado_id_fk
    foreign key (invitado_id) references public.invitados (id) on delete cascade,

  -- ON DELETE SET NULL: si un colaborador deja el proyecto se pierde la autoría,
  -- nunca el historial de respuestas.
  constraint confirmaciones_registrado_por_fk
    foreign key (registrado_por) references public.perfiles (id) on delete set null,

  -- Si hay respuesta real, hay fecha de respuesta.
  constraint confirmaciones_respondido_en_coherente
    check (estado = 'pendiente' or respondido_en is not null),

  -- Quien confirma ha contestado a la logística: el autobús y el alojamiento se
  -- contratan con esos números.
  constraint confirmaciones_logistica_completa
    check (
      estado <> 'confirmado'
      or (necesita_autobus is not null and necesita_alojamiento is not null)
    ),

  -- La autoría tiene que ser coherente con el origen: `registrado_por` no puede
  -- apuntar a la novia en una respuesta que llegó por el enlace público.
  constraint confirmaciones_autoria_coherente
    check (
      (origen = 'panel'                  and registrado_por is not null)
      or (origen in ('publico','sistema') and registrado_por is null)
    ),

  constraint confirmaciones_cancion_longitud
    check (cancion_solicitada is null
           or (btrim(cancion_solicitada) <> '' and char_length(cancion_solicitada) <= 200)),
  constraint confirmaciones_mensaje_longitud
    check (mensaje is null
           or (btrim(mensaje) <> '' and char_length(mensaje) <= 2000))
);
alter table public.confirmaciones enable row level security;

comment on table public.confirmaciones is
  'Historial de respuestas al RSVP, una fila por respuesta. Nunca se edita una '
  'respuesta: se inserta la siguiente y la anterior deja de ser vigente.';

comment on column public.confirmaciones.invitado_id is
  'Persona que responde. ON DELETE CASCADE: borrar al invitado borra su historial '
  '(derecho de supresión).';
comment on column public.confirmaciones.origen is
  'Distingue la respuesta que llegó por el enlace público de la que metieron los '
  'novios a mano y del alta automática inicial. Por defecto `publico` (el menos '
  'fiable) para que un olvido nunca disfrace una respuesta de más fiable.';
comment on column public.confirmaciones.respondido_en is
  'Cuándo respondió el invitado. En el origen público lo sella el servidor; en el '
  'panel puede ser anterior a `creado_en` si los novios registran a posteriori una '
  'respuesta dada por teléfono. Nunca puede estar en el futuro.';
comment on column public.confirmaciones.necesita_autobus is
  'NULL = todavía no ha contestado. Obligatorio en cuanto el estado es '
  '`confirmado`.';
comment on column public.confirmaciones.registrado_por is
  'Perfil que registró la respuesta desde el panel. NULL cuando respondió el '
  'propio invitado o cuando el perfil se ha borrado. Lo fija el servidor a partir '
  'de `auth.uid()`, jamás el cliente.';
comment on column public.confirmaciones.es_vigente is
  'Marca la última respuesta de cada invitado. Lo mantiene un trigger y lo '
  'garantiza un índice único parcial: consultar el estado actual no necesita ni '
  'subconsultas ni DISTINCT ON.';

-- Índice de la clave foránea, que además lee el historial de una persona ya
-- ordenado de la respuesta más reciente a la más antigua.
create index if not exists confirmaciones_invitado_id_idx
  on public.confirmaciones (invitado_id, creado_en desc);

-- Garantía dura de que sólo hay una respuesta vigente por invitado.
create unique index if not exists confirmaciones_vigente_por_invitado_idx
  on public.confirmaciones (invitado_id)
  where es_vigente;

-- Recuentos del panel: confirmados, pendientes, rechazados.
create index if not exists confirmaciones_estado_vigente_idx
  on public.confirmaciones (estado)
  where es_vigente;

-- Lista del autobús: pocas filas cumplen el predicado, el índice es diminuto.
create index if not exists confirmaciones_autobus_idx
  on public.confirmaciones (invitado_id)
  where es_vigente and necesita_autobus;

create index if not exists confirmaciones_registrado_por_idx
  on public.confirmaciones (registrado_por)
  where registrado_por is not null;


-- 5.1 Vigencia ----------------------------------------------------------------

create or replace function public.marcar_confirmacion_vigente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Toda respuesta que entra es la vigente. Que el cliente pueda insertar una
  -- fila con `es_vigente = false` es cómo un invitado se queda sin ninguna
  -- respuesta vigente y desaparece en silencio de los recuentos.
  new.es_vigente := true;

  -- Bloqueo de la persona: es el punto de serialización. Sin él, un doble clic
  -- en "Confirmar" hace que las dos transacciones lean la vieja fila vigente,
  -- ninguna degrade a la otra y la segunda choque contra el índice único (23505).
  perform 1 from public.invitados as i where i.id = new.invitado_id for update;

  -- BEFORE INSERT y no AFTER: el índice único parcial se comprueba al insertar
  -- la fila, así que la anterior tiene que dejar de ser vigente antes.
  update public.confirmaciones
     set es_vigente = false
   where invitado_id = new.invitado_id
     and es_vigente;

  return new;
end;
$$;

comment on function public.marcar_confirmacion_vigente() is
  'Al registrar una respuesta nueva, degrada la anterior de la misma persona y se '
  'asegura de que la entrante quede vigente. SECURITY DEFINER porque el histórico '
  'es de sólo inserción y ningún rol tiene UPDATE sobre él: con SECURITY INVOKER, '
  'el UPDATE afectaría a 0 filas en silencio y el INSERT chocaría con el índice '
  'único, dejando a los invitados sin poder rectificar su respuesta.';

create or replace trigger confirmaciones_vigente
  before insert on public.confirmaciones
  for each row execute function public.marcar_confirmacion_vigente();


-- 5.2 Sellado de la respuesta -------------------------------------------------

create or replace function public.sellar_respuesta_confirmacion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- El invitado no fecha su propia respuesta: la fecha la pone el servidor.
  if new.origen = 'publico' then
    new.respondido_en := now();
  end if;

  if new.respondido_en is not null and new.respondido_en > now() then
    raise exception 'RSV07'
      using errcode = 'check_violation',
            hint    = 'Una respuesta no puede estar fechada en el futuro.';
  end if;

  return new;
end;
$$;

comment on function public.sellar_respuesta_confirmacion() is
  'Sella `respondido_en` en el origen público y prohíbe siempre las fechas '
  'futuras. Sin esto, el histórico de "quién cambió de opinión y cuándo" lo dicta '
  'el cliente, incluidas fechas del año 3000 que descolocan cualquier orden.';

create or replace trigger confirmaciones_sellar_respuesta
  before insert on public.confirmaciones
  for each row execute function public.sellar_respuesta_confirmacion();


-- 5.3 Plazo de RSVP -----------------------------------------------------------

create or replace function public.validar_plazo_confirmacion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_limite timestamptz;
begin
  if new.origen <> 'publico' then
    -- Los novios pueden registrar a mano una respuesta fuera de plazo: es
    -- justamente lo que hacen cuando alguien llama por teléfono tarde.
    return new;
  end if;

  select c.fecha_limite_rsvp into v_limite
    from public.configuracion_boda as c
   limit 1;

  if v_limite is null or now() > v_limite then
    raise exception 'RSV03'
      using errcode = 'check_violation',
            hint    = 'El plazo para confirmar asistencia está cerrado.';
  end if;

  return new;
end;
$$;

comment on function public.validar_plazo_confirmacion() is
  'Aplica `configuracion_boda.fecha_limite_rsvp` en la base de datos, comparando '
  'siempre contra `now()` y nunca contra una fecha enviada por el cliente. El '
  'plazo deja de depender de que la función de aplicación se acuerde de mirarlo, '
  'y ninguna segunda ruta de escritura (importación, panel, futura política) se '
  'lo puede saltar.';

create or replace trigger confirmaciones_validar_plazo
  before insert on public.confirmaciones
  for each row execute function public.validar_plazo_confirmacion();


-- 5.4 Inmutabilidad del histórico ---------------------------------------------

create or replace function public.proteger_historial_confirmaciones()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Lista blanca POR SUSTRACCIÓN: cubre `id`, `creado_en` y toda columna que se
  -- añada en el futuro sin que nadie tenga que acordarse de ampliar una lista.
  -- Con la enumeración cerrada anterior se podía reescribir `creado_en` y
  -- reordenar la cronología de quién dijo qué y cuándo, que es lo único que esta
  -- tabla existe para probar.
  if to_jsonb(new) - 'es_vigente' - 'actualizado_en'
     is distinct from
     to_jsonb(old) - 'es_vigente' - 'actualizado_en'
  then
    raise exception 'CNF01'
      using errcode = 'restrict_violation',
            detail  = format('confirmacion=%s', old.id),
            hint    = 'Las confirmaciones son inmutables: registra una respuesta nueva.';
  end if;

  -- La vigencia sólo se apaga; nunca se vuelve a encender a mano. Si no,
  -- `es_vigente = true` sobre una fila antigua resucita una respuesta caducada y
  -- la convierte en la oficial.
  if new.es_vigente and not old.es_vigente then
    raise exception 'CNF02'
      using errcode = 'restrict_violation',
            detail  = format('confirmacion=%s', old.id),
            hint    = 'No se puede reactivar una respuesta caducada.';
  end if;

  return new;
end;
$$;

comment on function public.proteger_historial_confirmaciones() is
  'Impide reescribir una respuesta ya registrada. Los mensajes son códigos '
  'estables (CNF01/CNF02) y no copy: el texto visible vive en '
  'content/copy.es.json. Los identificadores viajan en DETAIL, que PostgREST no '
  'expone al cliente, para no convertir un error en un oráculo de existencia de '
  'uuids ajenos.';

create or replace trigger confirmaciones_inmutables
  before update on public.confirmaciones
  for each row execute function public.proteger_historial_confirmaciones();

create or replace trigger confirmaciones_actualizado_en
  before update on public.confirmaciones
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();


-- 5.5 Toda persona tiene siempre una respuesta vigente ------------------------

create or replace function public.crear_confirmacion_inicial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.confirmaciones (invitado_id, estado, origen)
  values (new.id, 'pendiente', 'sistema');

  return null;
end;
$$;

comment on function public.crear_confirmacion_inicial() is
  'Da de alta la fila "pendiente" de cada invitado nuevo, de modo que las '
  'consultas de estado sean un JOIN limpio, sin COALESCE ni LEFT JOIN por todas '
  'partes. SECURITY DEFINER: el histórico no concede INSERT directo a nadie, así '
  'que con SECURITY INVOKER dar de alta un invitado desde el panel moriría con '
  '42501.';

create or replace trigger invitados_confirmacion_inicial
  after insert on public.invitados
  for each row execute function public.crear_confirmacion_inicial();


create or replace function public.exigir_confirmacion_vigente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.invitados as i where i.id = old.invitado_id)
     and not exists (
       select 1 from public.confirmaciones as c
        where c.invitado_id = old.invitado_id and c.es_vigente
     )
  then
    raise exception 'CNF03'
      using errcode = 'restrict_violation',
            detail  = format('invitado=%s', old.invitado_id),
            hint    = 'Un invitado no puede quedarse sin respuesta vigente.';
  end if;

  return null;
end;
$$;

comment on function public.exigir_confirmacion_vigente() is
  'El índice único parcial garantiza COMO MUCHO una respuesta vigente por '
  'persona, nunca AL MENOS una. Esto cierra el otro lado: sin ello, un invitado '
  'sin fila vigente desaparece en silencio del recuento de confirmados, del '
  'reparto de menús y de la lista del autobús —ningún error, sólo números que no '
  'cuadran—. Diferido, para tolerar los pasos intermedios de una transacción.';

drop trigger if exists confirmaciones_siempre_vigente on public.confirmaciones;
create constraint trigger confirmaciones_siempre_vigente
  after update or delete on public.confirmaciones
  deferrable initially deferred
  for each row execute function public.exigir_confirmacion_vigente();


-- ----------------------------------------------------------------------------
-- 6. Permisos sobre las funciones de este bloque
-- ----------------------------------------------------------------------------

revoke execute on function public.componer_nombre_completo()                from public, anon, authenticated;
revoke execute on function public.generar_token_invitacion()                from public, anon, authenticated;
revoke execute on function public.huella_token(text)                        from public, anon, authenticated;
revoke execute on function public.normalizar_eventos_grupo()                from public, anon, authenticated;
revoke execute on function public.congelar_privilegios_grupo()              from public, anon, authenticated;
revoke execute on function public.invitados_validar_aforo_grupo()           from public, anon, authenticated;
revoke execute on function public.marcar_confirmacion_vigente()             from public, anon, authenticated;
revoke execute on function public.sellar_respuesta_confirmacion()           from public, anon, authenticated;
revoke execute on function public.validar_plazo_confirmacion()              from public, anon, authenticated;
revoke execute on function public.proteger_historial_confirmaciones()       from public, anon, authenticated;
revoke execute on function public.crear_confirmacion_inicial()              from public, anon, authenticated;
revoke execute on function public.exigir_confirmacion_vigente()             from public, anon, authenticated;

commit;
