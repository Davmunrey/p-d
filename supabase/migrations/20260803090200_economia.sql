-- ============================================================================
-- 20260803090200_economia.sql
-- Ticket: BODA-13 (proveedores, servicios, presupuesto y pagos)
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero:
--   El dinero. A quién se le pide presupuesto, qué se le contrata, en qué
--   categoría cae el gasto y cuándo hay que pagarlo.
--
-- Dos criterios que se aplican en todo el bloque:
--
--   · El rastro económico no se borra por arrastre. Facturas, contratos, gasto
--     y pagos sobreviven al borrado del proveedor: son contabilidad. Sólo
--     cascadean las filas que no significan nada sin su padre.
--   · Toda tabla activa RLS en la sentencia inmediatamente posterior a su
--     CREATE TABLE, antes de índices, comentarios y triggers. Con el ENABLE al
--     final de cada sección, un fallo a mitad de fichero deja tablas creadas y
--     sin RLS; y como los privilegios por defecto del esquema ya se revocaron en
--     la migración base, aquí nada nace concedido.
--
-- Todo el fichero va dentro de una transacción: o entra entero o no entra nada.
-- Las políticas RLS viven en 20260803090400_rls.sql.
-- Rollback: supabase/migrations/rollback/20260803090200_economia.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Tipos enumerados
-- ----------------------------------------------------------------------------

select public.asegurar_enum('estado_proveedor', array[
  'investigando', 'contactado', 'presupuesto_recibido', 'contratado', 'descartado'
]);

comment on type public.estado_proveedor is
  'Fases del embudo de contratación. El orden de declaración es el orden natural '
  'de avance, así que ORDER BY estado ya sale ordenado por lo avanzada que está '
  'la negociación.';

select public.asegurar_enum('tipo_documento_proveedor', array[
  'presupuesto', 'contrato', 'factura', 'otro'
]);

comment on type public.tipo_documento_proveedor is
  'Naturaleza del fichero adjunto. Determina qué documentos son vinculantes '
  '(contrato, factura) frente a los meramente informativos.';

select public.asegurar_enum('metodo_pago', array[
  'transferencia', 'tarjeta', 'efectivo', 'bizum', 'domiciliacion', 'otro'
]);

comment on type public.metodo_pago is
  'Forma en que se liquida un pago. Se guarda por trazabilidad contable; no '
  'condiciona ninguna lógica de la aplicación.';


-- ----------------------------------------------------------------------------
-- 2. Categorías de proveedor
-- ----------------------------------------------------------------------------

create table if not exists public.categorias_proveedor (
  id              uuid not null default gen_random_uuid(),
  nombre          text not null,
  descripcion     text,
  orden           smallint not null default 0,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  constraint categorias_proveedor_pk primary key (id),
  constraint categorias_proveedor_nombre_longitud
    check (length(btrim(nombre)) between 1 and 80),
  constraint categorias_proveedor_descripcion_longitud
    check (descripcion is null or char_length(descripcion) <= 500),
  constraint categorias_proveedor_orden_no_negativo
    check (orden >= 0)
);
alter table public.categorias_proveedor enable row level security;

comment on table public.categorias_proveedor is
  'Catálogo de tipos de proveedor (catering, fotografía, música, flores…). Es '
  'tabla y no enumerado porque los novios deben poder añadir categorías desde el '
  'panel sin migración de por medio.';
comment on column public.categorias_proveedor.orden is
  'Posición manual en los listados. Se separa del nombre para poder reordenar sin '
  'renombrar; los empates se resuelven alfabéticamente.';

-- Nombre único sin distinguir mayúsculas ni espaciado: evita «Catering» y
-- «catering» como dos categorías distintas.
create unique index if not exists categorias_proveedor_nombre_unico_idx
  on public.categorias_proveedor (lower(btrim(nombre)));

create index if not exists categorias_proveedor_orden_idx
  on public.categorias_proveedor (orden, nombre);

create or replace trigger categorias_proveedor_actualizado_en
  before update on public.categorias_proveedor
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();


-- ----------------------------------------------------------------------------
-- 3. Proveedores
-- ----------------------------------------------------------------------------

create table if not exists public.proveedores (
  id                     uuid not null default gen_random_uuid(),

  categoria_id           uuid not null,

  nombre                 text not null,
  persona_contacto       text,
  correo_electronico     text,
  telefono               text,
  sitio_web              text,
  estado                 public.estado_proveedor not null default 'investigando',
  valoracion             smallint,
  importe_presupuestado  numeric(12, 2),
  importe_acordado       numeric(12, 2),
  notas                  text,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),

  constraint proveedores_pk primary key (id),

  -- ON DELETE RESTRICT: borrar una categoría que aún tiene proveedores dejaría
  -- el embudo sin clasificar. Obliga a recategorizar antes de borrar.
  constraint proveedores_categoria_id_fk
    foreign key (categoria_id) references public.categorias_proveedor (id) on delete restrict,

  constraint proveedores_nombre_longitud
    check (length(btrim(nombre)) between 1 and 160),
  constraint proveedores_persona_contacto_longitud
    check (persona_contacto is null or char_length(persona_contacto) <= 120),
  constraint proveedores_correo_valido
    check (public.es_correo_valido(correo_electronico)),
  constraint proveedores_telefono_formato
    check (telefono is null or telefono ~ '^\+?[0-9 ().-]{6,25}$'),
  constraint proveedores_sitio_web_formato
    check (sitio_web is null or sitio_web ~* '^https?://'),
  constraint proveedores_valoracion_rango
    check (valoracion is null or valoracion between 1 and 5),
  constraint proveedores_importes_no_negativos
    check (coalesce(importe_presupuestado, 0) >= 0 and coalesce(importe_acordado, 0) >= 0),
  constraint proveedores_notas_longitud
    check (notas is null or char_length(notas) <= 4000)
);
alter table public.proveedores enable row level security;

comment on table public.proveedores is
  'Empresas y profesionales candidatos o contratados. Guarda tanto los '
  'descartados como los contratados: el histórico de a quién se preguntó y qué '
  'presupuestó es parte del valor de la herramienta.';
comment on column public.proveedores.estado is
  'Fase del embudo. Un proveedor descartado no se borra, se marca: así no se '
  'vuelve a pedir presupuesto a quien ya dijo que no.';
comment on column public.proveedores.valoracion is
  'Impresión subjetiva de los novios, de 1 a 5. NULL mientras no se ha valorado; '
  'no se usa 0 como «sin valorar» para poder distinguir ambos casos.';
comment on column public.proveedores.importe_presupuestado is
  'Lo que el proveedor ofertó. Se conserva aunque luego se acuerde otra cifra, '
  'para poder comparar ofertas dentro de la misma categoría.';
comment on column public.proveedores.importe_acordado is
  'Lo finalmente pactado. Es una cifra de cabecera del embudo; el desglose real '
  'de lo que se paga vive en `servicios`, `partidas_presupuesto` y `pagos`.';

create index if not exists proveedores_categoria_id_idx
  on public.proveedores (categoria_id);

-- El panel filtra el embudo por estado en casi cada pantalla.
create index if not exists proveedores_estado_idx
  on public.proveedores (estado);

create index if not exists proveedores_nombre_trgm_idx
  on public.proveedores using gin (public.sin_acentos(nombre) extensions.gin_trgm_ops);

create or replace trigger proveedores_normalizar_correo
  before insert or update of correo_electronico on public.proveedores
  for each row execute function public.normalizar_correo('correo_electronico');

create or replace trigger proveedores_actualizado_en
  before update on public.proveedores
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();


-- ----------------------------------------------------------------------------
-- 4. Documentos del proveedor
-- ----------------------------------------------------------------------------

create table if not exists public.documentos_proveedor (
  id                   uuid not null default gen_random_uuid(),

  proveedor_id         uuid not null,
  subido_por           uuid,

  tipo                 public.tipo_documento_proveedor not null default 'otro',
  nombre               text not null,
  ruta_almacenamiento  text not null,
  tipo_mime            text,
  tamano_bytes         bigint,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),

  constraint documentos_proveedor_pk primary key (id),

  -- ON DELETE RESTRICT y NO cascade: una factura o un contrato son documentación
  -- contable y no pueden desaparecer porque alguien pulse «Borrar» en la ficha
  -- del fotógrafo en vez de marcarlo como descartado. Además, tras una cascada la
  -- aplicación ya no ve estas filas y los objetos quedarían huérfanos para
  -- siempre en el bucket, sin nada que los referencie ni forma de encontrarlos.
  constraint documentos_proveedor_proveedor_id_fk
    foreign key (proveedor_id) references public.proveedores (id) on delete restrict,

  -- ON DELETE SET NULL: si quien subió el documento deja el proyecto, el
  -- documento sigue siendo válido; sólo se pierde la autoría.
  constraint documentos_proveedor_subido_por_fk
    foreign key (subido_por) references public.perfiles (id) on delete set null,

  constraint documentos_proveedor_nombre_longitud
    check (length(btrim(nombre)) between 1 and 200),
  constraint documentos_proveedor_ruta_valida
    check (public.es_ruta_almacenamiento_valida(ruta_almacenamiento)),
  constraint documentos_proveedor_tipo_mime_longitud
    check (tipo_mime is null or char_length(tipo_mime) <= 120),
  constraint documentos_proveedor_tamano_positivo
    check (tamano_bytes is null or tamano_bytes > 0)
);
alter table public.documentos_proveedor enable row level security;

comment on table public.documentos_proveedor is
  'Adjuntos de un proveedor (presupuestos, contratos, facturas) alojados en '
  'Supabase Storage. La tabla guarda la referencia y los metadatos; el binario '
  'nunca vive en la base de datos.';
comment on column public.documentos_proveedor.ruta_almacenamiento is
  'Ruta dentro del bucket. Única en toda la tabla para que dos filas no apunten al '
  'mismo objeto y un borrado deje la otra rota. Validada contra rutas absolutas y '
  'travesía de directorios: las políticas de Storage se apoyan en el prefijo de '
  'carpeta y un `../` apuntaría fuera del prefijo esperado.';
comment on column public.documentos_proveedor.tamano_bytes is
  'Se guarda en el alta para poder listar y avisar de adjuntos pesados sin '
  'consultar Storage en cada render.';

create unique index if not exists documentos_proveedor_ruta_unica_idx
  on public.documentos_proveedor (ruta_almacenamiento);

create index if not exists documentos_proveedor_proveedor_id_idx
  on public.documentos_proveedor (proveedor_id, tipo);

create index if not exists documentos_proveedor_subido_por_idx
  on public.documentos_proveedor (subido_por)
  where subido_por is not null;

create or replace trigger documentos_proveedor_actualizado_en
  before update on public.documentos_proveedor
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();


-- ----------------------------------------------------------------------------
-- 5. Servicios contratados
-- ----------------------------------------------------------------------------

create table if not exists public.servicios (
  id               uuid not null default gen_random_uuid(),

  proveedor_id     uuid not null,

  nombre           text not null,
  descripcion      text,
  precio_unitario  numeric(12, 2) not null default 0,
  cantidad         integer not null default 1,
  por_invitado     boolean not null default false,

  -- Importe cerrado sólo cuando no depende de los confirmados. Si el precio es
  -- por invitado, el total es variable y se calcula en `v_servicios_importe`
  -- cruzando con las confirmaciones vigentes, no aquí.
  importe_fijo     numeric(12, 2)
    generated always as (
      case when por_invitado then null else precio_unitario * cantidad end
    ) stored,

  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),

  constraint servicios_pk primary key (id),

  -- ON DELETE RESTRICT, igual que los documentos: el desglose de lo contratado
  -- es la justificación del gasto que sigue apareciendo en `pagos` y en
  -- `partidas_presupuesto`. Borrar al proveedor obliga a resolverlo a mano.
  constraint servicios_proveedor_id_fk
    foreign key (proveedor_id) references public.proveedores (id) on delete restrict,

  constraint servicios_nombre_longitud
    check (length(btrim(nombre)) between 1 and 160),
  constraint servicios_descripcion_longitud
    check (descripcion is null or char_length(descripcion) <= 2000),
  constraint servicios_precio_no_negativo
    check (precio_unitario >= 0),
  constraint servicios_cantidad_positiva
    check (cantidad > 0)
);
alter table public.servicios enable row level security;

comment on table public.servicios is
  'Desglose de lo contratado a cada proveedor (menú adulto, barra libre, horas '
  'extra de fotógrafo…). Permite que el presupuesto se mueva solo cuando cambia '
  'el número de invitados confirmados.';
comment on column public.servicios.por_invitado is
  'Si es cierto, `precio_unitario` se multiplica por los invitados confirmados en '
  'lugar de por una cantidad fija: al confirmarse un invitado, el coste sube solo.';
comment on column public.servicios.cantidad is
  'Multiplicador. Con `por_invitado = false` es el número de unidades '
  'contratadas; con `por_invitado = true`, cuántas unidades tocan por cabeza '
  '(normalmente 1).';
comment on column public.servicios.importe_fijo is
  'Total calculado por la base de datos para los servicios de precio cerrado. '
  'NULL a propósito en los de precio por invitado, para que nadie lo confunda con '
  'un total real; ése lo da `public.v_servicios_importe`.';

create index if not exists servicios_proveedor_id_idx
  on public.servicios (proveedor_id);

-- El recálculo al confirmarse invitados sólo mira los servicios variables.
create index if not exists servicios_por_invitado_idx
  on public.servicios (proveedor_id)
  where por_invitado;

-- `servicios` tiene columna generada: la comparación de fila entera no se puede
-- usar en el WHEN de un trigger BEFORE, así que se enumeran las columnas de
-- negocio. El efecto es el mismo: un UPDATE que no cambia nada no mueve la fecha.
create or replace trigger servicios_actualizado_en
  before update on public.servicios
  for each row
  when (
    (old.proveedor_id, old.nombre, old.descripcion, old.precio_unitario,
     old.cantidad, old.por_invitado)
    is distinct from
    (new.proveedor_id, new.nombre, new.descripcion, new.precio_unitario,
     new.cantidad, new.por_invitado)
  )
  execute function public.fijar_actualizado_en();


-- ----------------------------------------------------------------------------
-- 6. Categorías de presupuesto
-- ----------------------------------------------------------------------------

create table if not exists public.categorias_presupuesto (
  id                uuid not null default gen_random_uuid(),
  nombre            text not null,
  descripcion       text,
  importe_previsto  numeric(12, 2) not null default 0,
  orden             smallint not null default 0,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),

  constraint categorias_presupuesto_pk primary key (id),
  constraint categorias_presupuesto_nombre_longitud
    check (length(btrim(nombre)) between 1 and 80),
  constraint categorias_presupuesto_descripcion_longitud
    check (descripcion is null or char_length(descripcion) <= 500),
  constraint categorias_presupuesto_importe_no_negativo
    check (importe_previsto >= 0),
  constraint categorias_presupuesto_orden_no_negativo
    check (orden >= 0)
);
alter table public.categorias_presupuesto enable row level security;

comment on table public.categorias_presupuesto is
  'Grandes bloques de gasto con su techo previsto (banquete, fotografía, '
  'música…). Es la referencia contra la que se compara el gasto real en '
  '`public.v_resumen_presupuesto`.';
comment on column public.categorias_presupuesto.importe_previsto is
  'Lo que los novios decidieron destinar a esta categoría antes de pedir '
  'presupuestos. Se conserva aunque se dispare el gasto real: la desviación es '
  'justo el dato interesante.';

create unique index if not exists categorias_presupuesto_nombre_unico_idx
  on public.categorias_presupuesto (lower(btrim(nombre)));

create index if not exists categorias_presupuesto_orden_idx
  on public.categorias_presupuesto (orden, nombre);

create or replace trigger categorias_presupuesto_actualizado_en
  before update on public.categorias_presupuesto
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();


-- ----------------------------------------------------------------------------
-- 7. Partidas de gasto
-- ----------------------------------------------------------------------------

create table if not exists public.partidas_presupuesto (
  id                uuid not null default gen_random_uuid(),

  categoria_id      uuid not null,
  proveedor_id      uuid,

  concepto          text not null,
  descripcion       text,
  importe_estimado  numeric(12, 2) not null default 0,
  importe_real      numeric(12, 2),
  pagada            boolean not null default false,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),

  constraint partidas_presupuesto_pk primary key (id),

  -- ON DELETE RESTRICT: borrar una categoría con gasto asociado falsearía el
  -- presupuesto. Primero se reasignan las partidas, luego se borra.
  constraint partidas_presupuesto_categoria_id_fk
    foreign key (categoria_id) references public.categorias_presupuesto (id) on delete restrict,

  -- ON DELETE SET NULL: el gasto ocurrió y debe seguir contando aunque el
  -- proveedor se elimine de la agenda. Se pierde el vínculo, no el importe.
  constraint partidas_presupuesto_proveedor_id_fk
    foreign key (proveedor_id) references public.proveedores (id) on delete set null,

  constraint partidas_presupuesto_concepto_longitud
    check (length(btrim(concepto)) between 1 and 160),
  constraint partidas_presupuesto_descripcion_longitud
    check (descripcion is null or char_length(descripcion) <= 2000),
  constraint partidas_presupuesto_importes_no_negativos
    check (importe_estimado >= 0 and coalesce(importe_real, 0) >= 0)
);
alter table public.partidas_presupuesto enable row level security;

comment on table public.partidas_presupuesto is
  'Línea concreta de gasto dentro de una categoría. Es la unidad sobre la que se '
  'comparan previsión y realidad, y de la que cuelgan los pagos.';
comment on column public.partidas_presupuesto.importe_real is
  'Coste definitivo una vez conocido. NULL mientras sólo hay estimación: sirve '
  'para distinguir «aún no cerrado» de «cerrado en 0 €».';
comment on column public.partidas_presupuesto.pagada is
  'Marca manual de partida liquidada, para gastos pequeños que no se desglosan en '
  'pagos. Cuando hay pagos registrados, manda la suma de pagos.';

create index if not exists partidas_presupuesto_categoria_id_idx
  on public.partidas_presupuesto (categoria_id);

create index if not exists partidas_presupuesto_proveedor_id_idx
  on public.partidas_presupuesto (proveedor_id)
  where proveedor_id is not null;

-- El panel destaca lo que queda por liquidar.
create index if not exists partidas_presupuesto_pendientes_idx
  on public.partidas_presupuesto (categoria_id)
  where not pagada;

create or replace trigger partidas_presupuesto_actualizado_en
  before update on public.partidas_presupuesto
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();


-- ----------------------------------------------------------------------------
-- 8. Pagos
-- ----------------------------------------------------------------------------

create table if not exists public.pagos (
  id                 uuid not null default gen_random_uuid(),

  partida_id         uuid not null,
  registrado_por     uuid,

  importe            numeric(12, 2) not null,
  fecha_vencimiento  date not null,
  pagado_en          date,
  metodo             public.metodo_pago,
  justificante_ruta  text,
  notas              text,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),

  constraint pagos_pk primary key (id),

  -- ON DELETE RESTRICT: el histórico de pagos es contabilidad, no se borra por
  -- arrastre. Si una partida tiene pagos, hay que resolverlos explícitamente.
  constraint pagos_partida_id_fk
    foreign key (partida_id) references public.partidas_presupuesto (id) on delete restrict,

  -- ON DELETE SET NULL: el pago sigue existiendo aunque el usuario que lo
  -- registró desaparezca; sólo se pierde quién lo anotó.
  constraint pagos_registrado_por_fk
    foreign key (registrado_por) references public.perfiles (id) on delete set null,

  constraint pagos_importe_positivo
    check (importe > 0),
  constraint pagos_justificante_solo_si_pagado
    check (justificante_ruta is null or pagado_en is not null),
  constraint pagos_justificante_ruta_valida
    check (justificante_ruta is null or public.es_ruta_almacenamiento_valida(justificante_ruta)),
  constraint pagos_notas_longitud
    check (notas is null or char_length(notas) <= 2000)
);
alter table public.pagos enable row level security;

comment on table public.pagos is
  'Calendario de pagos de cada partida: señales, plazos y liquidación final. '
  'Responde a la pregunta operativa «qué hay que pagar y cuándo», que no se '
  'deduce del importe total de la partida.';
comment on column public.pagos.fecha_vencimiento is
  'Cuándo hay que pagar. Obligatoria: un pago sin fecha no se puede recordar ni '
  'avisar, que es el motivo de que exista esta tabla.';
comment on column public.pagos.pagado_en is
  'NULL mientras el pago está pendiente. Su presencia, y no un booleano, es lo que '
  'marca un pago como realizado.';
comment on column public.pagos.justificante_ruta is
  'Ruta en Supabase Storage del recibo o la transferencia. Sólo puede existir si '
  'el pago está hecho. Se redacta en la bitácora de auditoría.';

create index if not exists pagos_partida_id_idx
  on public.pagos (partida_id);

-- Consulta más frecuente del panel: próximos vencimientos sin pagar.
create index if not exists pagos_pendientes_vencimiento_idx
  on public.pagos (fecha_vencimiento)
  where pagado_en is null;

create index if not exists pagos_pagados_idx
  on public.pagos (pagado_en)
  where pagado_en is not null;

create index if not exists pagos_registrado_por_idx
  on public.pagos (registrado_por)
  where registrado_por is not null;

create unique index if not exists pagos_justificante_unico_idx
  on public.pagos (justificante_ruta)
  where justificante_ruta is not null;

create or replace trigger pagos_actualizado_en
  before update on public.pagos
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();

commit;
