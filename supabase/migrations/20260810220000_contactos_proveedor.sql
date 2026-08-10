-- ============================================================================
-- 20260810220000_contactos_proveedor.sql
-- Ticket: BODA-70 (#51) · Proveedores y sus categorías
--
-- Qué hace este fichero:
--   1. `contactos_proveedor`: varios contactos por proveedor.
--   2. Sus privilegios y sus políticas RLS, con el mismo modelo que el resto
--      de tablas de gestión: lee quien puede leer, escribe quien puede editar.
--   3. Un juego inicial de categorías de proveedor, sólo si no hay ninguna.
--
-- Rollback: supabase/migrations/rollback/20260810220000_contactos_proveedor.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Varios contactos por proveedor
-- ---------------------------------------------------------------------------
--
-- POR QUÉ NO BASTA CON LAS COLUMNAS QUE YA HAY. `proveedores` guarda un
-- `persona_contacto`, un `correo_electronico` y un `telefono`, y con una boda
-- eso se queda corto el mismo día del enlace: quien te vende el catering no es
-- quien está en la cocina, y el número del comercial a las once de la noche no
-- lo coge nadie. Lo que hace falta el día de la boda es el móvil del jefe de
-- sala, y ése no cabía en ninguna de esas tres columnas.
--
-- LAS COLUMNAS VIEJAS SE QUEDAN, y a propósito: son el contacto principal, el
-- que aparece en la lista sin tener que ir a buscar. Esta tabla es «además de»,
-- no «en vez de» — migrar los datos existentes a filas y vaciar las columnas
-- habría roto la ficha y la agenda del día por un cambio que no lo pedía.

create table if not exists public.contactos_proveedor (
  id                  uuid not null default gen_random_uuid(),
  proveedor_id        uuid not null,

  nombre              text not null,
  -- Qué hace esta persona: «jefe de sala», «el que monta el sonido». Es lo que
  -- convierte una lista de nombres en una agenda que sirve de algo.
  papel               text,
  correo_electronico  text,
  telefono            text,
  -- Marca a quién llamar el día de la boda, que casi nunca es el comercial.
  es_del_dia          boolean not null default false,
  notas               text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),

  constraint contactos_proveedor_pk primary key (id),

  -- ON DELETE CASCADE, al revés que en el resto de esta parte del esquema. Un
  -- contacto no es contabilidad: no tiene sentido conservarlo cuando el
  -- proveedor al que pertenece ya no está, y `restrict` obligaría a borrar los
  -- contactos a mano antes de poder borrar a nadie.
  constraint contactos_proveedor_proveedor_id_fk
    foreign key (proveedor_id) references public.proveedores (id) on delete cascade,

  constraint contactos_proveedor_nombre_longitud
    check (length(btrim(nombre)) between 1 and 120),
  constraint contactos_proveedor_papel_longitud
    check (papel is null or char_length(papel) <= 80),
  constraint contactos_proveedor_correo_valido
    check (public.es_correo_valido(correo_electronico)),
  -- El mismo patrón que en `proveedores`: si aquí fuera más laxo, un teléfono
  -- válido en un sitio sería inválido en el otro.
  constraint contactos_proveedor_telefono_formato
    check (telefono is null or telefono ~ '^\+?[0-9 ().-]{6,25}$'),
  constraint contactos_proveedor_notas_longitud
    check (notas is null or char_length(notas) <= 1000),

  -- Un contacto sin forma de contactarlo no es un contacto. Se exige al menos
  -- una de las dos vías: sin esto, la agenda del día de la boda se llenaría de
  -- nombres a los que no se puede llamar, que es lo contrario de su utilidad.
  constraint contactos_proveedor_alguna_via
    check (correo_electronico is not null or telefono is not null)
);
alter table public.contactos_proveedor enable row level security;

comment on table public.contactos_proveedor is
  'Contactos adicionales de un proveedor. El comercial que firma el contrato '
  'casi nunca es quien está el día de la boda, y es el segundo el que hace '
  'falta cuando el autobús no aparece.';

comment on column public.contactos_proveedor.es_del_dia is
  'A quién llamar el día de la boda. Es lo que ordena la agenda de BODA-101.';

create index if not exists contactos_proveedor_proveedor_id_idx
  on public.contactos_proveedor (proveedor_id, es_del_dia desc, nombre);

create or replace trigger contactos_proveedor_normalizar_correo
  before insert or update of correo_electronico on public.contactos_proveedor
  for each row execute function public.normalizar_correo('correo_electronico');

create or replace trigger contactos_proveedor_actualizado_en
  before update on public.contactos_proveedor
  for each row execute function public.fijar_actualizado_en();

-- ---------------------------------------------------------------------------
-- 2. Privilegios y políticas
-- ---------------------------------------------------------------------------
--
-- Se enumeran las operaciones en lugar de conceder `all`: `all` incluye
-- TRUNCATE, y RLS no se aplica a TRUNCATE. Es la misma regla que sigue el
-- fichero de RLS con las otras veintidós tablas.

grant select on public.contactos_proveedor to authenticated;
grant insert, update, delete on public.contactos_proveedor to authenticated;

drop policy if exists contactos_proveedor_leer on public.contactos_proveedor;
create policy contactos_proveedor_leer on public.contactos_proveedor
  for select to authenticated
  using ((select public.puede_leer()));

-- `with check` además de `using`: sin él se podría mover una fila a un
-- proveedor cualquiera, que es una escritura que la política no ha autorizado.
drop policy if exists contactos_proveedor_escribir on public.contactos_proveedor;
create policy contactos_proveedor_escribir on public.contactos_proveedor
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

alter table public.contactos_proveedor force row level security;

-- ---------------------------------------------------------------------------
-- 3. Categorías con las que empezar
-- ---------------------------------------------------------------------------
--
-- SÓLO SI LA TABLA ESTÁ VACÍA. Las categorías del seed llevan el prefijo
-- «(DES)» y no salen de desarrollo, así que en producción `categorias_proveedor`
-- estaba vacía — y sin categoría no se puede dar de alta un proveedor, porque
-- `proveedores.categoria_id` es `not null`. El módulo nacía inservible hasta
-- que alguien escribiera nueve categorías a mano.
--
-- No son una decisión de producto cerrada: se renombran, se reordenan y se
-- borran desde el panel. Son el punto de partida de cualquier boda, no la lista
-- definitiva de ésta.
--
-- El `where not exists` mira la tabla entera y no cada nombre: quien ya haya
-- empezado a montar su lista no se merece que una migración le meta nueve
-- categorías por medio.

insert into public.categorias_proveedor (nombre, descripcion, orden)
select * from (values
  ('Lugar',        'La finca y todo lo que va con ella.',              0),
  ('Catering',     'Comida, bebida y barra libre.',                    1),
  ('Fotografía',   'Foto y vídeo, antes y durante.',                   2),
  ('Música',       'Ceremonia, cóctel y la fiesta de después.',        3),
  ('Flores',       'Decoración floral y ramo.',                        4),
  ('Trajes',       'Vestido, traje, tocados y complementos.',          5),
  ('Belleza',      'Peluquería y maquillaje.',                         6),
  ('Transporte',   'Autobuses y coches.',                              7),
  ('Papelería',    'Invitaciones, seating y detalles impresos.',       8),
  ('Otros',        'Lo que no cabe en ninguna de las anteriores.',     9)
) as iniciales (nombre, descripcion, orden)
where not exists (select 1 from public.categorias_proveedor);

commit;
