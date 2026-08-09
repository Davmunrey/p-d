-- ============================================================================
-- ROLLBACK de 20260803090500_funciones_publicas.sql
-- Ticket: BODA-14 (funciones públicas del RSVP y emisión de enlaces)
--
-- Deshace exactamente lo que hace su migración, en orden inverso: primero se
-- retiran las concesiones y después se eliminan las funciones.
--
-- AVISO OPERATIVO: al eliminar `rotar_token_invitacion` y
-- `crear_grupo_invitacion` desaparece la única vía de emitir enlaces de
-- invitación, y al eliminar `obtener_invitacion` y `registrar_confirmacion` el
-- RSVP público deja de existir. Los tokens ya emitidos NO se pierden: sus
-- huellas siguen en `grupos_invitacion.huella_token` y vuelven a funcionar en
-- cuanto se reaplique la migración.
--
-- Si además se ha programado la purga con pg_cron, quitarla antes:
--   select cron.unschedule('purgar-intentos-rsvp');
-- ============================================================================

begin;

revoke execute on function public.crear_grupo_invitacion(text, smallint, public.lado_invitacion, public.evento_boda[]) from authenticated;
revoke execute on function public.rotar_token_invitacion(uuid) from authenticated;

revoke execute on function public.anadir_acompanante(text, text, text, boolean, public.tipo_menu, text) from anon, authenticated;
revoke execute on function public.registrar_confirmacion(text, jsonb) from anon, authenticated;
revoke execute on function public.obtener_invitacion(text)            from anon, authenticated;

drop function if exists public.purgar_intentos_rsvp();
drop function if exists public.anadir_acompanante(text, text, text, boolean, public.tipo_menu, text);
drop function if exists public.registrar_confirmacion(text, jsonb);
drop function if exists public.obtener_invitacion(text);
drop function if exists public.registrar_intento_rsvp(text, boolean);
drop function if exists public.exigir_cupo_rsvp();
drop function if exists public.huella_peticion();
drop function if exists public.crear_grupo_invitacion(text, smallint, public.lado_invitacion, public.evento_boda[]);
drop function if exists public.rotar_token_invitacion(uuid);

commit;
