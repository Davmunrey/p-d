-- ============================================================================
-- 20260803090300_organizacion.sql
-- Ticket: BODA-13 (tareas, mesas del banquete y medios de la landing)
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero:
--   1. Tareas de organización.
--   2. Mesas del banquete, con su posición en el plano, y la clave foránea que
--      ata `invitados.mesa_id` (la COLUMNA ya existe: la declara la migración de
--      invitados, que es donde nace la tabla que la contiene).
--   3. Medios: las imágenes de la landing.
--   4. Engancha el trigger de auditoría a TODAS las tablas de dominio. Se hace
--      aquí, en la última migración de esquema, porque es el primer punto en el
--      que existen todas.
--
-- Este fichero es el último que crea tablas: a partir de aquí sólo hay
-- seguridad, funciones y vistas.
-- Rollback: supabase/migrations/rollback/20260803090300_organizacion.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Tipos enumerados
--    El orden de los valores no es decorativo: define el `<` del tipo, así que
--    `order by estado` y `order by prioridad desc` ordenan de forma natural sin
--    tablas auxiliares ni CASE en las consultas.
-- ----------------------------------------------------------------------------

select public.asegurar_enum('estado_tarea', array['pendiente', 'en_progreso', 'hecha']);

comment on type public.estado_tarea is 'Ciclo de vida de una tarea, en orden de progreso.';

select public.asegurar_enum('prioridad_tarea', array['baja', 'media', 'alta', 'urgente']);

comment on type public.prioridad_tarea is 'Prioridad de una tarea, en orden ascendente de urgencia.';

select public.asegurar_enum('forma_mesa', array[
  'redonda', 'ovalada', 'rectangular', 'cuadrada', 'imperial'
]);

comment on type public.forma_mesa is
  'Forma física de la mesa. El plano del banquete la usa para dibujar la silueta '
  'correcta.';


-- ----------------------------------------------------------------------------
-- 2. Tareas
-- ----------------------------------------------------------------------------

create table if not exists public.tareas (
  id              uuid not null default gen_random_uuid(),

  titulo          text not null,
  descripcion     text,
  estado          public.estado_tarea    not null default 'pendiente',
  prioridad       public.prioridad_tarea not null default 'media',
  fecha_limite    date,
  completada_en   timestamptz,

  responsable_id  uuid,
  proveedor_id    uuid,
  categoria       text,

  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  constraint tareas_pk primary key (id),

  -- ON DELETE SET NULL: si se revoca el acceso a un colaborador, su tarea sigue
  -- existiendo y queda sin responsable, visible en el panel para reasignarla. Un
  -- CASCADE aquí borraría trabajo pendiente de la boda al borrar un usuario.
  constraint tareas_responsable_id_fk
    foreign key (responsable_id) references public.perfiles (id) on delete set null,

  -- ON DELETE SET NULL: descartar un proveedor no debe borrar la tarea («pedir
  -- presupuesto a X»); la tarea pierde el vínculo, no la existencia.
  constraint tareas_proveedor_id_fk
    foreign key (proveedor_id) references public.proveedores (id) on delete set null,

  constraint tareas_titulo_longitud
    check (length(btrim(titulo)) between 1 and 160),
  constraint tareas_descripcion_longitud
    check (descripcion is null or char_length(descripcion) <= 4000),
  constraint tareas_categoria_longitud
    check (categoria is null or length(btrim(categoria)) between 1 and 60),

  -- Coherencia dura: «hecha» y sólo «hecha» tiene fecha de cierre. Evita el
  -- clásico dato zombi de una tarea reabierta que conserva su `completada_en`.
  constraint tareas_completada_coherente
    check ((estado = 'hecha') = (completada_en is not null))
);
alter table public.tareas enable row level security;

comment on table public.tareas is
  'Lista de tareas de organización de la boda. Alimenta el tablero del panel y el '
  'aviso de vencimientos.';
comment on column public.tareas.completada_en is
  'Cuándo se cerró la tarea. Lo rellena y lo limpia un trigger a partir de '
  '`estado`: el cliente nunca lo envía, así el dato no depende de que el frontend '
  'se acuerde.';
comment on column public.tareas.responsable_id is
  'Quién se encarga. NULL = sin asignar, que es un estado legítimo y frecuente.';
comment on column public.tareas.categoria is
  'Agrupación libre para el tablero (papeleo, música, viaje…). Texto y no '
  'enumerado porque las categorías las inventan los novios sobre la marcha.';

create or replace function public.sellar_tarea_completada()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.estado = 'hecha' and new.completada_en is null then
    new.completada_en := now();
  elsif new.estado <> 'hecha' then
    new.completada_en := null;
  end if;
  return new;
end;
$$;

comment on function public.sellar_tarea_completada() is
  'Mantiene `completada_en` en sintonía con `estado`, de modo que la restricción '
  '`tareas_completada_coherente` se cumpla siempre sin trabajo del cliente.';

create or replace trigger tareas_sellar_completada
  before insert or update of estado on public.tareas
  for each row execute function public.sellar_tarea_completada();

create or replace trigger tareas_actualizado_en
  before update on public.tareas
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();

-- Vista principal del tablero: lo abierto, por fecha límite. Parcial porque las
-- tareas hechas se acumulan y nunca se consultan así.
create index if not exists tareas_abiertas_fecha_limite_idx
  on public.tareas (fecha_limite nulls last)
  where estado <> 'hecha';

-- Filtro por columna del tablero y orden por urgencia dentro de cada una.
create index if not exists tareas_estado_prioridad_idx
  on public.tareas (estado, prioridad desc);

-- Índices de claves foráneas: sin ellos, borrar un perfil o un proveedor obliga
-- a un recorrido completo de `tareas` para aplicar el SET NULL, y «mis tareas»
-- tampoco usa índice.
create index if not exists tareas_responsable_id_idx on public.tareas (responsable_id);
create index if not exists tareas_proveedor_id_idx   on public.tareas (proveedor_id);


-- ----------------------------------------------------------------------------
-- 3. Mesas
-- ----------------------------------------------------------------------------

create table if not exists public.mesas (
  id              uuid not null default gen_random_uuid(),
  nombre          text not null,
  capacidad       smallint not null,
  forma           public.forma_mesa not null default 'redonda',
  posicion_x      numeric(8, 2),
  posicion_y      numeric(8, 2),
  notas           text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  constraint mesas_pk primary key (id),

  constraint mesas_nombre_longitud
    check (length(btrim(nombre)) between 1 and 60),

  -- Cota superior generosa (mesa imperial): no es una regla de producto, es una
  -- red contra el dedazo (un 200 en vez de un 20 descuadraría todo el reparto).
  constraint mesas_capacidad_rango
    check (capacidad between 1 and 30),

  -- O la mesa está colocada en el plano, o no lo está. Media coordenada no
  -- significa nada y rompería el render.
  constraint mesas_posicion_completa
    check (num_nulls(posicion_x, posicion_y) in (0, 2)),

  -- El lienzo del plano es un espacio propio de coordenadas positivas; el límite
  -- superior atrapa arrastres corruptos que sacarían la mesa fuera del plano.
  constraint mesas_posicion_dentro_del_lienzo
    check (
      posicion_x is null
      or (posicion_x between 0 and 10000 and posicion_y between 0 and 10000)
    ),

  constraint mesas_notas_longitud
    check (notas is null or char_length(notas) <= 1000)
);
alter table public.mesas enable row level security;

comment on table public.mesas is
  'Mesas del banquete. Además del reparto de invitados, guarda la posición en el '
  'plano visual para que el diseño de sala sobreviva a recargas y a cambios de '
  'dispositivo.';
comment on column public.mesas.capacidad is
  'Comensales que caben. El panel avisa cuando los invitados asignados la superan; '
  'la base de datos no lo bloquea porque durante el reparto se sobrepasa '
  'temporalmente.';
comment on column public.mesas.posicion_x is
  'Coordenada horizontal en el lienzo del plano (unidades del plano, no píxeles). '
  'NULL = mesa creada pero aún no colocada.';

-- «Mesa 4» y «mesa 4 » son la misma mesa para quien organiza: la unicidad se
-- aplica sobre el nombre normalizado, no sobre los bytes.
create unique index if not exists mesas_nombre_unico_idx
  on public.mesas (lower(btrim(nombre)));

create or replace trigger mesas_actualizado_en
  before update on public.mesas
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();


-- 3.1 Asignación de mesa ------------------------------------------------------
-- La columna `invitados.mesa_id` ya existe: la declara la migración de invitados.
-- Aquí sólo se ata la clave foránea, que es donde nace la tabla referenciada.
-- ON DELETE SET NULL: eliminar una mesa del plano NO puede borrar personas; sus
-- invitados vuelven a la bolsa de «sin mesa» y se reasignan.

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint where conname = 'invitados_mesa_id_fk'
  ) then
    alter table public.invitados
      add constraint invitados_mesa_id_fk
      foreign key (mesa_id) references public.mesas (id) on delete set null;
  end if;
end;
$$;

-- Necesario para el SET NULL del borrado y para listar «los de esta mesa».
create index if not exists invitados_mesa_id_idx on public.invitados (mesa_id);


-- ----------------------------------------------------------------------------
-- 4. Medios
-- ----------------------------------------------------------------------------

create table if not exists public.medios (
  id                   uuid not null default gen_random_uuid(),

  ruta_almacenamiento  text not null,
  texto_alternativo    jsonb not null,
  seccion              public.seccion_landing not null,
  orden                smallint,
  ancho                integer,
  alto                 integer,
  marcador_borroso            text,
  publicado            boolean not null default false,

  subido_por           uuid,

  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),

  constraint medios_pk primary key (id),

  -- ON DELETE SET NULL: la foto de la landing no desaparece porque se dé de baja
  -- a quien la subió; sólo se pierde la autoría.
  constraint medios_subido_por_fk
    foreign key (subido_por) references public.perfiles (id) on delete set null,

  constraint medios_ruta_valida
    check (public.es_ruta_almacenamiento_valida(ruta_almacenamiento)),

  -- La obligatoriedad del idioma se comprueba en un trigger contra
  -- `configuracion_boda.idioma_por_defecto`: aquí sólo se exige que sea un
  -- objeto. Fijar 'es' en el CHECK duplicaría en código un dato que ya es
  -- configuración y que los novios pueden cambiar (regla 1).
  constraint medios_texto_alternativo_objeto
    check (jsonb_typeof(texto_alternativo) = 'object'),

  constraint medios_orden_no_negativo
    check (orden is null or orden >= 0),

  -- Ancho y alto viajan juntos: con uno solo no se puede reservar el hueco y
  -- volvería el desplazamiento de layout que el plan maestro quiere evitar.
  constraint medios_dimensiones_coherentes
    check (
      (ancho is null) = (alto is null)
      and (ancho is null or (ancho between 1 and 20000 and alto between 1 and 20000))
    ),

  constraint medios_marcador_borroso_longitud
    check (marcador_borroso is null or length(marcador_borroso) between 6 and 200)
);
alter table public.medios enable row level security;

comment on table public.medios is
  'Imágenes de la landing. Única fuente de verdad: ninguna foto pública vive en '
  '`/public`, todas se suben y ordenan desde el panel y se sirven desde Storage.';

comment on column public.medios.ruta_almacenamiento is
  'Ruta del objeto dentro del bucket. La base de datos guarda la ruta, nunca la '
  'URL firmada, que caduca. Admite mayúsculas: `galeria/DSC_0001.JPG` es una clave '
  'legal y habitual, y rechazarla dejaba ficheros huérfanos en el bucket con un '
  'error que el usuario no podía corregir.';
comment on column public.medios.texto_alternativo is
  'Texto alternativo por idioma: {"es": "…", "en": "…"}. Obligatorio en el idioma '
  'por defecto de la boda.';
comment on column public.medios.orden is
  'Posición dentro de su sección. Si se deja a NULL al insertar, un trigger coloca '
  'la imagen al final.';
comment on column public.medios.publicado is
  'Por defecto FALSE: una foto recién subida no aparece en la landing hasta que '
  'alguien la publica a conciencia. Es la columna que filtra la política RLS de '
  '`anon`.';

-- Un mismo objeto de Storage no puede estar dado de alta dos veces.
create unique index if not exists medios_ruta_unica_idx
  on public.medios (ruta_almacenamiento);

-- Orden determinista dentro de cada sección. DEFERRABLE para poder permutar dos
-- imágenes en una sola transacción sin pasar por valores intermedios ficticios.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint where conname = 'medios_orden_unico_por_seccion'
  ) then
    alter table public.medios
      add constraint medios_orden_unico_por_seccion
      unique (seccion, orden) deferrable initially deferred;
  end if;
end;
$$;

create or replace function public.asignar_orden_medio()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.orden is null then
    select coalesce(max(m.orden), -1) + 1
      into new.orden
      from public.medios as m
     where m.seccion = new.seccion;
  end if;
  return new;
end;
$$;

comment on function public.asignar_orden_medio() is
  'Coloca al final de su sección los medios insertados sin `orden`. SECURITY '
  'INVOKER a propósito: quien inserta una foto es un editor, que ya tiene SELECT '
  'sobre `medios` por política, así que no hace falta ningún privilegio elevado '
  'para leer el máximo. Dos altas simultáneas en la misma sección pueden chocar '
  'contra la unicidad: el cliente reintenta, que es preferible a serializar toda '
  'la tabla.';

create or replace trigger medios_asignar_orden
  before insert on public.medios
  for each row execute function public.asignar_orden_medio();


-- 4.1 Texto alternativo obligatorio en el idioma de la boda -------------------

create or replace function public.validar_texto_alternativo_medio()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_idioma text;
begin
  select c.idioma_por_defecto into v_idioma
    from public.configuracion_boda as c
   limit 1;

  v_idioma := coalesce(v_idioma, 'es');

  if not (new.texto_alternativo ? v_idioma)
     or length(btrim(new.texto_alternativo ->> v_idioma)) not between 3 and 300
  then
    raise exception 'MED01'
      using errcode = 'check_violation',
            detail  = format('idioma=%s', v_idioma),
            hint    = 'Falta el texto alternativo en el idioma por defecto de la boda.';
  end if;

  return new;
end;
$$;

comment on function public.validar_texto_alternativo_medio() is
  'Accesibilidad AA: ninguna imagen entra sin texto alternativo en el idioma que '
  'la landing sirve realmente. Lo lee de `configuracion_boda` en vez de fijar '
  '"es" en un CHECK, porque el idioma por defecto es configuración: si los novios '
  'lo cambian a "ca", la restricción tiene que seguir protegiendo el idioma que '
  'se muestra, no uno escrito a mano en una migración.';

create or replace trigger medios_validar_texto_alternativo
  before insert or update of texto_alternativo on public.medios
  for each row execute function public.validar_texto_alternativo_medio();

create or replace trigger medios_actualizado_en
  before update on public.medios
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();

-- Consulta de la landing pública: lo publicado de una sección, ya ordenado.
-- Parcial: los borradores no se piden nunca por esta vía.
create index if not exists medios_publicados_idx
  on public.medios (seccion, orden)
  where publicado;

create index if not exists medios_subido_por_idx
  on public.medios (subido_por)
  where subido_por is not null;


-- ----------------------------------------------------------------------------
-- 5. Auditoría de TODAS las tablas de dominio
--
--    El trigger genérico se construyó en la migración base describiéndose como
--    «reutilizable por cualquier tabla del esquema», y hasta ahora sólo colgaba
--    de dos. Sin esto, borrar el grupo «Familia Pérez Gómez» se lleva por
--    cascada a 5 invitados y todo su historial de confirmaciones —menús,
--    alergias, autobús— sin dejar ni una fila que diga quién lo hizo, cuándo, ni
--    con qué datos. Los triggers de fila SÍ se disparan en los borrados en
--    cascada, así que la traza queda completa y el borrado es reconstruible.
--
--    Se hace aquí porque ésta es la primera migración en la que existen todas
--    las tablas.
-- ----------------------------------------------------------------------------

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'perfiles',
    'invitaciones_panel',
    'configuracion_boda',
    'configuracion_privada',
    'secciones_landing',
    'grupos_invitacion',
    'notas_grupo',
    'invitados',
    'notas_invitado',
    'confirmaciones',
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
    execute format(
      'create or replace trigger %I after insert or update or delete on public.%I
         for each row execute function public.registrar_auditoria()',
      v_tabla || '_auditoria', v_tabla
    );
  end loop;
end;
$$;


-- ----------------------------------------------------------------------------
-- 6. Permisos sobre las funciones de este bloque
-- ----------------------------------------------------------------------------

revoke execute on function public.sellar_tarea_completada()           from public, anon, authenticated;
revoke execute on function public.asignar_orden_medio()               from public, anon, authenticated;
revoke execute on function public.validar_texto_alternativo_medio()   from public, anon, authenticated;

commit;
