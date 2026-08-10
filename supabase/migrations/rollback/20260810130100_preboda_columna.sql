-- Rollback de 20260810130100_preboda_columna.sql
--
-- Deja el sistema como si la preboda no existiera.
--
-- OJO: `drop column` se lleva por delante a qué momento pertenecía cada hito.
-- Los hitos siguen ahí —no se borra ninguno— pero los de la víspera pasan a ser
-- indistinguibles de los del día de la boda, y la sección del programa los
-- pintaría todos juntos. Si hay hitos de preboda cargados, conviene anotarlos
-- antes de revertir.

delete from public.secciones_landing where seccion = 'preboda';

drop index if exists public.hitos_programa_momento_orden_idx;

alter table public.hitos_programa drop column if exists momento;
