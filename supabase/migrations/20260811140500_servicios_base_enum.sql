-- ============================================================================
-- 20260811140500_servicios_base_enum.sql
-- Ticket: BODA-74 (#55) · Servicios con precio por invitado
--
-- Qué hace este fichero:
--   1. `base_servicio`: a quién multiplica un servicio por invitado — a
--      todos, solo a los adultos o solo a los niños.
--
-- Va en su propio fichero por la regla de siempre: un valor de enum no se
-- puede usar en la misma transacción que lo crea. Las columnas llegan en la
-- siguiente migración.
--
-- Rollback: supabase/migrations/rollback/20260811140500_servicios_base_enum.sql
-- ============================================================================

begin;

-- El menú infantil no cuesta lo que el de adulto, y la barra libre no se
-- multiplica por los niños. Sin esto, «precio por invitado» obliga a mentir
-- en el precio o en la cuenta.
select public.asegurar_enum('base_servicio', array[
  'todos',
  'adultos',
  'ninos'
]);

commit;
