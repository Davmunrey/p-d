-- ============================================================================
-- ROLLBACK de 20260803090600_vistas.sql
-- Ticket: BODA-14 (vistas de lectura)
--
-- Deshace exactamente lo que hace su migración, en orden inverso: primero se
-- retiran las concesiones y después se eliminan las vistas.
--
-- El barrido final de EXECUTE de la migración no se «deshace»: devolver el
-- permiso de ejecución al pseudo-rol PUBLIC sobre todas las funciones sería
-- reabrir un agujero, no revertir un cambio. Las funciones desaparecen con el
-- rollback de 20260803090500_funciones_publicas.sql, que es su sitio.
-- ============================================================================

begin;

revoke select on public.v_proximos_pagos          from authenticated;
revoke select on public.v_resumen_presupuesto     from authenticated;
revoke select on public.v_servicios_importe       from authenticated;
revoke select on public.v_menus_confirmados       from authenticated;
revoke select on public.v_estadisticas_invitados  from authenticated;

revoke select on public.v_medios_publicados       from anon, authenticated;
revoke select on public.v_secciones_publicas      from anon, authenticated;
revoke select on public.v_configuracion_publica   from anon, authenticated;

drop view if exists public.v_proximos_pagos;
drop view if exists public.v_resumen_presupuesto;
drop view if exists public.v_servicios_importe;
drop view if exists public.v_menus_confirmados;
drop view if exists public.v_estadisticas_invitados;
drop view if exists public.v_medios_publicados;
drop view if exists public.v_secciones_publicas;
drop view if exists public.v_configuracion_publica;

commit;
