-- ============================================================================
-- 20260810230000_estados_proveedor_enum.sql
-- Ticket: BODA-71 (#52) · Estado del proveedor, de investigando a contratado
--
-- Faltaban dos fases, y son justo las dos en las que se pierde de vista a
-- quién falta por contestar:
--
--   * `presupuesto_pedido` — se lo has pedido y estás esperando. Sin este
--     estado, un proveedor al que llamaste hace tres semanas y otro al que le
--     pediste presupuesto ayer se veían exactamente igual, y el que se te
--     olvida es siempre el primero.
--   * `visitado` — has ido a verlo. Entre «tengo su presupuesto» y «lo
--     contrato» hay una visita que en una finca o un catering no es un
--     trámite: es la decisión.
--
-- POR QUÉ ESTE FICHERO SÓLO TOCA EL ENUMERADO
--
-- PostgreSQL no deja usar un valor nuevo de un enumerado dentro de la misma
-- transacción que lo añade. La columna que va a guardarlos y todo lo demás van
-- en la migración siguiente, que corre en su propia transacción: así el par
-- funciona igual lo aplique `psql` en autocommit o el CLI de Supabase
-- envolviendo cada fichero. Es la misma pareja que `secciones_faltantes_*`.
--
-- `asegurar_enum` no sirve aquí: sale sin hacer nada si el tipo ya existe, que
-- es justo el caso.
--
-- EL ORDEN DE DECLARACIÓN IMPORTA. `estado_proveedor` se ordena por el orden en
-- que se declaran sus valores, y un `order by estado` sale entonces ordenado
-- por lo avanzada que está la negociación. Por eso cada valor se coloca con
-- `after` donde le toca y no al final, que es donde iría por defecto: al final,
-- «visitado» saldría después de «descartado».
--
-- Rollback: supabase/migrations/rollback/20260810230000_estados_proveedor_enum.sql
-- ============================================================================

alter type public.estado_proveedor
  add value if not exists 'presupuesto_pedido' after 'contactado';

alter type public.estado_proveedor
  add value if not exists 'visitado' after 'presupuesto_recibido';
