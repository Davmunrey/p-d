-- ============================================================================
-- 20260810230100_motivo_descarte.sql
-- Ticket: BODA-71 (#52) · Estado del proveedor, de investigando a contratado
--
-- Segunda mitad de la migración anterior: allí se añadieron los valores al
-- enumerado, aquí se usan.
--
-- Qué trae:
--   1. `motivo_descarte`: por qué se descartó, y obligatorio al descartar.
--   2. `v_categorias_sin_contratar`: qué categorías no tienen todavía a nadie
--      contratado, que es la pregunta útil de todo el módulo.
--
-- Rollback: supabase/migrations/rollback/20260810230100_motivo_descarte.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Por qué se descartó
-- ---------------------------------------------------------------------------
--
-- «Dentro de seis meses no se acuerda nadie» es literal. Se descarta un
-- fotógrafo en marzo porque no tenía libre la fecha, y en septiembre alguien
-- vuelve a encontrarlo en Instagram, le vuelve a escribir, y vuelve a recibir
-- la misma respuesta. El motivo no es documentación: es lo que evita repetir
-- la gestión.
--
-- SE EXIGE POR RESTRICCIÓN Y NO SÓLO POR PANTALLA. Un `check` es lo único que
-- vale para los dos caminos —el panel y cualquier `update` suelto— y además
-- convierte «se me olvidó preguntarlo» en un error inmediato en vez de en una
-- fila que nadie va a completar después.

alter table public.proveedores
  add column if not exists motivo_descarte text;

comment on column public.proveedores.motivo_descarte is
  'Por qué se descartó. Obligatorio con estado `descartado`: sin él, dentro de '
  'seis meses alguien vuelve a escribir al mismo proveedor y recibe la misma '
  'respuesta.';

alter table public.proveedores
  drop constraint if exists proveedores_motivo_descarte_longitud;
alter table public.proveedores
  add constraint proveedores_motivo_descarte_longitud
  check (motivo_descarte is null or char_length(motivo_descarte) between 3 and 1000);

/*
  DESCARTADO EXIGE MOTIVO; LOS DEMÁS ESTADOS NO LO ADMITEN.

  Las dos mitades importan. Sin la primera, el motivo se queda en blanco justo
  cuando hace falta. Sin la segunda, un proveedor que se descartó y luego se
  recuperó conserva un «no tenía libre la fecha» que ya no es verdad y que
  aparece en su ficha contradiciendo su estado.

  `not valid` a propósito: valida lo que entre a partir de ahora sin exigir que
  las filas que ya están cumplan la regla. En una base con proveedores ya
  descartados —sin motivo, porque la columna no existía— una restricción
  normal haría fallar la migración entera, y el arreglo sería inventarse
  motivos. Se valida hacia delante y los viejos se completan al editarlos.
*/
alter table public.proveedores
  drop constraint if exists proveedores_descartado_con_motivo;
alter table public.proveedores
  add constraint proveedores_descartado_con_motivo
  check (
    (estado = 'descartado' and motivo_descarte is not null)
    or (estado <> 'descartado' and motivo_descarte is null)
  ) not valid;

-- ---------------------------------------------------------------------------
-- 2. Qué categorías no tienen todavía a nadie contratado
-- ---------------------------------------------------------------------------
--
-- La pregunta que de verdad se hace quien organiza no es «¿cuántos proveedores
-- tengo?», es «¿qué me falta por cerrar?». Una lista de proveedores no la
-- contesta: hay que recorrerla entera comprobando categoría por categoría si
-- alguno está contratado, y lo que se busca es precisamente lo que NO está.
--
-- ES UNA VISTA Y NO UN CÁLCULO EN LA PANTALLA porque también la va a querer el
-- resumen del panel, y dos sitios contando lo mismo por su cuenta acaban
-- diciendo cifras distintas la semana que alguien cambie qué cuenta como
-- cerrado.
--
-- `security_invoker` para que la vista se lea con los permisos de quien
-- pregunta y no con los de quien la creó: sin eso, una vista es un agujero por
-- el que se salta RLS.

create or replace view public.v_categorias_sin_contratar
with (security_invoker = true) as
select
  c.id,
  c.nombre,
  c.orden,
  count(p.id) filter (where p.estado <> 'descartado')::int as candidatos
from public.categorias_proveedor as c
left join public.proveedores as p on p.categoria_id = c.id
group by c.id, c.nombre, c.orden
having count(p.id) filter (where p.estado = 'contratado') = 0
order by c.orden, c.nombre;

comment on view public.v_categorias_sin_contratar is
  'Categorías sin nadie contratado, con cuántos candidatos vivos tienen. Un '
  'cero en `candidatos` es una categoría en la que no se ha empezado; un tres '
  'es una en la que hay que decidir.';

grant select on public.v_categorias_sin_contratar to authenticated;

commit;
