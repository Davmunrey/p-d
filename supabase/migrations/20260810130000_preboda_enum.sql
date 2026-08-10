-- ============================================================================
-- BODA-36 · La preboda: el enumerado
--
-- La entrega tiene una sección que aquí no existía: «Si llegáis antes de
-- tiempo», el plan del viernes para quien viene de fuera. No es un capricho de
-- maquetación — media boda llega la víspera y sin esto no sabe qué hacer con
-- la tarde.
--
-- Se resuelve con lo que ya hay. Un hito de la preboda es un hito del programa
-- con hora, título y descripción: lo único que cambia es **qué día**. Así que
-- en vez de una tabla nueva, `hitos_programa` gana una columna que dice a qué
-- momento pertenece cada fila, y las dos secciones leen la misma tabla.
--
-- ESTE FICHERO SÓLO TOCA LOS ENUMERADOS. PostgreSQL no deja usar un valor
-- nuevo de un enumerado dentro de la misma transacción que lo añade, así que
-- la columna y las filas van en la migración siguiente, que corre en su propia
-- transacción. Mismo par que en BODA-20.
--
-- Rollback: supabase/migrations/rollback/20260810130000_preboda_enum.sql
-- ============================================================================

-- La sección va delante del programa: el viernes es antes que el sábado.
alter type public.seccion_landing add value if not exists 'preboda' after 'galeria';

-- Y el momento al que pertenece cada hito. `boda` es el valor de siempre, así
-- que las filas que ya existen no cambian de significado al añadirlo.
select public.asegurar_enum('momento_programa', array['preboda', 'boda']);
