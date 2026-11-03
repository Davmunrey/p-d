-- ============================================================================
-- Fuera los hitos de la víspera
--
-- Desde 20261103140000 la víspera es un lugar («Preboda en {lugar}», con
-- `configuracion_boda.lugar_preboda`) y no un horario: sus hitos se quedaron
-- guardados sin pintarse en ninguna parte —ni en la web ni en el panel, que
-- perdió la pestaña de la víspera—. Los novios han pedido borrarlos.
--
-- Son los tres que sembró 20260810210000_datos_de_la_boda.sql (la catedral,
-- los vinos por el Barrio Húmedo y la cena); el rollback los devuelve tal
-- cual. La columna `momento` y su valor 'preboda' se quedan: el enumerado lo
-- usan también las confirmaciones, que siguen preguntando por la víspera.
-- ============================================================================

begin;

delete from public.hitos_programa where momento = 'preboda';

commit;
