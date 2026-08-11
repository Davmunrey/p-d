-- ============================================================================
-- 20260811140000_documentos_boda_enum.sql
-- Ticket: BODA-105 (#129) · Los papeles de la boda civil, con sus caducidades
--
-- Qué hace este fichero:
--   1. `titular_documento`: de quién es cada papel. El Excel lo daba por
--      sabido y en la práctica es la primera pregunta.
--   2. `estado_documento_boda`: pendiente, solicitado o conseguido.
--
-- Va en su propio fichero por la regla de siempre: un valor de enum no se
-- puede usar en la misma transacción que lo crea, y `supabase db push`
-- envuelve cada migración en una. La tabla que los usa llega en la siguiente.
--
-- Rollback: supabase/migrations/rollback/20260811140000_documentos_boda_enum.sql
-- ============================================================================

begin;

-- Los mismos tres valores que `lado` en `grupos_invitacion`, pero es OTRO
-- enum a propósito: aquello dice de qué lado viene una invitación y esto de
-- quién es un certificado. Si mañana un papel pasa a ser «de los testigos»,
-- este enum crece sin arrastrar a las invitaciones.
select public.asegurar_enum('titular_documento', array[
  'novia',
  'novio',
  'ambos'
]);

-- «Conseguido» no es el final del ciclo de vida: un papel conseguido sigue
-- caducando. Por eso el estado no lleva un valor «caducado» — la caducidad se
-- calcula contra la fecha, no se declara a mano, y un estado que alguien tiene
-- que acordarse de cambiar siempre acaba mintiendo.
select public.asegurar_enum('estado_documento_boda', array[
  'pendiente',
  'solicitado',
  'conseguido'
]);

commit;
