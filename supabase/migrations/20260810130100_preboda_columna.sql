-- ============================================================================
-- BODA-36 · La preboda: la columna y la sección
--
-- Segunda mitad de la migración anterior: allí se añadieron los valores a los
-- enumerados, aquí se usan. Van en ficheros distintos porque PostgreSQL no
-- permite usar un valor de enumerado en la misma transacción que lo crea.
--
-- Rollback: supabase/migrations/rollback/20260810130100_preboda_columna.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A qué momento pertenece cada hito
-- ----------------------------------------------------------------------------

alter table public.hitos_programa
  add column if not exists momento public.momento_programa not null default 'boda';

comment on column public.hitos_programa.momento is
  'Si el hito es del día de la boda o de la víspera. Una tabla y no dos porque '
  'un hito de la preboda es exactamente lo mismo —hora, título y descripción— y '
  'lo único que cambia es el día: dos tablas iguales se acabarían separando en '
  'cuanto una ganara una columna que la otra no.';

-- El índice de ordenación lo usan las dos secciones, cada una con su momento.
create index if not exists hitos_programa_momento_orden_idx
  on public.hitos_programa (momento, orden, hora);

-- ----------------------------------------------------------------------------
-- 2. La sección, en su sitio del orden
-- ----------------------------------------------------------------------------
--
-- Entre `galeria` (30) y `programa` (35), que es donde va: el viernes antes
-- que el sábado. El hueco existía justo para esto.
--
-- ENTRA APAGADA, y es la diferencia con BODA-20. Allí se dieron de alta dos
-- secciones que la web YA estaba pintando. Ésta no tiene todavía ni un hito:
-- encenderla ahora pondría en el menú un enlace a una sección vacía. Se
-- enciende sola en cuanto haya contenido —la landing sólo pinta lo que tiene
-- datos— pero el interruptor lo deja puesto quien organiza.

insert into public.secciones_landing (seccion, visible, orden) values
  ('preboda', false, 33)
on conflict (seccion) do nothing;
