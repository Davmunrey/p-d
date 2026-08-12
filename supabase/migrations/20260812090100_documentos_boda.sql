-- ============================================================================
-- 20260812090100_documentos_boda.sql
-- Ticket: BODA-105 (#129) · Los papeles de la boda civil
--
-- Qué hace este fichero:
--   1. Los dos enumerados: de quién es cada papel y en qué punto está.
--   2. `documentos_boda`, con la regla que da sentido a la tabla: un documento
--      conseguido tiene fecha de obtención, y uno que no lo está no la tiene.
--   3. Sus privilegios y sus políticas RLS, con el mismo modelo que el resto
--      de tablas de gestión: lee quien puede leer, escribe quien puede editar.
--   4. `v_documentos_boda`, que compara la caducidad con la fecha de la boda.
--
-- POR QUÉ ESTO ES UNA TABLA Y NO UNA NOTA EN EL MÓVIL
--
-- Los papeles de un expediente matrimonial civil caducan. El certificado de
-- empadronamiento vale tres meses, el literal de nacimiento seis, y el que se
-- pide en enero para una boda de septiembre no sirve el día de la boda: hay que
-- volver a pedirlo. Ese detalle no se olvida por descuido, se olvida porque
-- «conseguido» parece el final del camino — y lo parece justo hasta el día en
-- que el juzgado dice que no.
--
-- LA CADUCIDAD SE COMPARA CONTRA LA FECHA DE LA BODA Y LA COMPARA LA BASE. Un
-- documento que caduca el 3 de septiembre está perfectamente vigente hoy y no
-- sirve para una boda del 20; preguntárselo al reloj del navegador es
-- preguntárselo a un reloj que puede estar mal puesto o en otro huso.
--
-- SIN SEMILLA, Y ES UNA DECISIÓN. La lista de papeles depende del registro
-- civil, de la nacionalidad de cada uno y de si alguno estuvo casado antes.
-- Sembrar «los ocho documentos de siempre» sería inventarse el expediente de
-- esta boda y dar por hecho lo que sólo confirma el juzgado. La pantalla vacía
-- lo explica en vez de callarse.
--
-- Rollback: supabase/migrations/rollback/20260812090100_documentos_boda.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Los enumerados
-- ---------------------------------------------------------------------------
--
-- DE QUIÉN ES EL PAPEL, porque casi ninguno es de los dos: el certificado de
-- nacimiento lo pide cada uno en el registro donde nació, que suele ser un
-- pueblo distinto. Sin esta columna, la lista no dice quién tiene que moverse
-- —que es la única pregunta operativa que se hace mirándola— y los dos acaban
-- yendo al mismo sitio o ninguno va a ninguno.
select public.asegurar_enum('titular_documento', array['novia', 'novio', 'ambos']);

-- EL PUNTO EN EL QUE ESTÁ, con «solicitado» en medio y no sólo un booleano.
-- «Pedido y esperando» es el estado en el que más tiempo pasa un papel del
-- expediente, y confundirlo con «pendiente» hace pedirlo dos veces; confundirlo
-- con «conseguido» hace presentarse en el juzgado sin él.
--
-- El orden de los valores no es alfabético a propósito: define el operador `<`
-- del tipo y con él el ORDER BY de los listados. Lo que falta va primero.
select public.asegurar_enum(
  'estado_documento_boda',
  array['pendiente', 'solicitado', 'conseguido']
);

-- ---------------------------------------------------------------------------
-- 2. La tabla
-- ---------------------------------------------------------------------------

create table if not exists public.documentos_boda (
  id              uuid not null default gen_random_uuid(),

  titulo          text not null,
  de_quien        public.titular_documento not null default 'ambos',
  -- Dónde se pide: «Registro Civil de Cuenca», «cita previa en sede
  -- electrónica». Es lo que evita volver a buscarlo cada vez que toca renovarlo.
  donde_se_pide   text,
  notas           text,

  estado          public.estado_documento_boda not null default 'pendiente',
  obtenido_en     date,
  -- NULL es «no caduca», que es un caso de verdad: el libro de familia no
  -- caduca y el certificado de empadronamiento sí. Un valor por defecto aquí
  -- daría por caducable todo lo que se apunte con prisa.
  caduca_en       date,

  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  constraint documentos_boda_pk primary key (id),

  constraint documentos_boda_titulo_longitud
    check (length(btrim(titulo)) between 2 and 160),
  constraint documentos_boda_donde_se_pide_longitud
    check (donde_se_pide is null or char_length(donde_se_pide) <= 200),
  constraint documentos_boda_notas_longitud
    check (notas is null or char_length(notas) <= 2000),

  /*
    CONSEGUIDO ⇔ FECHA DE OBTENCIÓN, y las dos mitades hacen falta.

    Sin la primera, un papel se marca como conseguido sin decir cuándo — y sin
    el cuándo no hay forma de saber si el plazo de validez sigue vivo, que es
    para lo que existe la tabla.

    Sin la segunda, deshacer un «conseguido» puesto por error deja la fecha
    colgando: la ficha diría a la vez que el papel no está y que se recogió el
    martes. Dos verdades sobre lo mismo y la base sin saber cuál manda.
  */
  constraint documentos_boda_conseguido_con_fecha
    check (
      (estado = 'conseguido' and obtenido_en is not null)
      or
      (estado <> 'conseguido' and obtenido_en is null)
    )
);
alter table public.documentos_boda enable row level security;

comment on table public.documentos_boda is
  'Los papeles del expediente matrimonial civil, con sus caducidades. Existe '
  'por lo que no cabe en una lista de tareas: un documento conseguido puede '
  'dejar de servir antes de la boda, y eso no lo avisa nadie.';

comment on column public.documentos_boda.de_quien is
  'Quién tiene que pedirlo. Casi ninguno es de los dos: cada uno pide su '
  'certificado de nacimiento en el registro donde nació.';

comment on column public.documentos_boda.caduca_en is
  'Hasta cuándo vale. NULL es «no caduca», que es un caso real: el libro de '
  'familia no caduca y el empadronamiento sí.';

comment on column public.documentos_boda.obtenido_en is
  'Cuándo se recogió. Existe si —y sólo si— el estado es `conseguido`, y lo '
  'impone `documentos_boda_conseguido_con_fecha`.';

-- El orden con el que se lee la pantalla: lo que falta primero y, dentro de
-- cada grupo, lo que antes deja de valer.
create index if not exists documentos_boda_estado_idx
  on public.documentos_boda (estado, caduca_en nulls last, titulo);

create or replace trigger documentos_boda_actualizado_en
  before update on public.documentos_boda
  for each row execute function public.fijar_actualizado_en();

-- ---------------------------------------------------------------------------
-- 3. Privilegios y políticas
-- ---------------------------------------------------------------------------
--
-- Se enumeran las operaciones en lugar de conceder `all`: `all` incluye
-- TRUNCATE, y RLS no se aplica a TRUNCATE. Es la misma regla que sigue el
-- fichero de RLS con el resto de tablas de gestión.
--
-- A `anon` no se le concede nada, y no es un olvido: el expediente lleva
-- nombres, fechas de nacimiento y de dónde es cada uno. Es lo más privado que
-- hay en esta base.

grant select on public.documentos_boda to authenticated;
grant insert, update, delete on public.documentos_boda to authenticated;

drop policy if exists documentos_boda_leer on public.documentos_boda;
create policy documentos_boda_leer on public.documentos_boda
  for select to authenticated
  using ((select public.puede_leer()));

-- `with check` además de `using`: sin él, una fila se podría dejar en un estado
-- que la política no ha autorizado a escribir.
drop policy if exists documentos_boda_escribir on public.documentos_boda;
create policy documentos_boda_escribir on public.documentos_boda
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

alter table public.documentos_boda force row level security;

-- ---------------------------------------------------------------------------
-- 4. La vista que hace la cuenta
-- ---------------------------------------------------------------------------
--
-- «CADUCA ANTES DE LA BODA» LO CALCULA LA BASE, y ahí está el módulo entero.
-- La fecha de la boda vive en `configuracion_boda` como `timestamptz`, así que
-- para saber qué DÍA es hay que llevarla a su zona horaria antes de quedarse
-- con la fecha: una ceremonia a las 00:30 en Madrid es el día anterior en UTC,
-- y con eso un documento que caduca justo el día de la boda saldría avisado —
-- o al revés, que es peor.
--
-- ES UN `LEFT JOIN LATERAL` Y NO UN `CROSS JOIN`. `configuracion_boda` tiene
-- fila única garantizada por restricción, pero un `cross join` contra una tabla
-- vacía no devuelve cero fechas: devuelve cero DOCUMENTOS. La lista entera
-- desaparecería sin decir por qué, que es la peor forma posible de fallar.
--
-- `security_invoker = on`: la vista lee con los permisos de quien pregunta, así
-- que RLS de `documentos_boda` sigue mandando. Sin eso, la vista sería una
-- puerta de atrás a la tabla que protege.
create or replace view public.v_documentos_boda
with (security_invoker = on) as
select
  d.id,
  d.titulo,
  d.de_quien,
  d.donde_se_pide,
  d.notas,
  d.estado,
  d.obtenido_en,
  d.caduca_en,
  b.fecha_boda,
  (
    d.caduca_en is not null
    and b.fecha_boda is not null
    and d.caduca_en < b.fecha_boda
  ) as caduca_antes_de_la_boda
from public.documentos_boda as d
left join lateral (
  select (c.fecha_hora_ceremonia at time zone c.zona_horaria)::date as fecha_boda
    from public.configuracion_boda as c
   limit 1
) as b on true
order by d.estado, d.caduca_en nulls last, d.titulo;

comment on view public.v_documentos_boda is
  'Los documentos de la boda con la única cuenta que importa ya hecha: si '
  'caducan antes del día de la ceremonia. Se compara con la fecha de la base y '
  'en la zona horaria de la boda, nunca con el reloj del navegador.';

grant select on public.v_documentos_boda to authenticated;

commit;
