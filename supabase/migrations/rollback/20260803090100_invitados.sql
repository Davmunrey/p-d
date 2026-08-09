-- ============================================================================
-- ROLLBACK de 20260803090100_invitados.sql
-- Ticket: BODA-12 (invitados, grupos de invitación y confirmaciones)
--
-- Deshace exactamente lo que hace su migración, en orden inverso: primero las
-- tablas (que arrastran sus índices, restricciones y triggers), después las
-- funciones y por último los enumerados.
--
-- AVISO: esto borra invitados, confirmaciones y tokens. Las huellas de los
-- tokens desaparecen con `grupos_invitacion`, así que TODOS los enlaces
-- repartidos quedan invalidados para siempre: reaplicar la migración no los
-- recupera, hay que volver a emitirlos con `rotar_token_invitacion()`.
--
-- `public.fijar_actualizado_en()`, `public.normalizar_correo()` y
-- `public.sin_acentos()` NO se borran: pertenecen a la migración base y las usan
-- las demás tablas del esquema.
-- ============================================================================

begin;

drop table if exists public.confirmaciones;
drop table if exists public.notas_invitado;
drop table if exists public.invitados;
drop table if exists public.notas_grupo;
drop table if exists public.grupos_invitacion;

drop function if exists public.exigir_confirmacion_vigente();
drop function if exists public.crear_confirmacion_inicial();
drop function if exists public.proteger_historial_confirmaciones();
drop function if exists public.validar_plazo_confirmacion();
drop function if exists public.sellar_respuesta_confirmacion();
drop function if exists public.marcar_confirmacion_vigente();
drop function if exists public.invitados_validar_aforo_grupo();
drop function if exists public.congelar_privilegios_grupo();
drop function if exists public.normalizar_eventos_grupo();
drop function if exists public.componer_nombre_completo();
drop function if exists public.huella_token(text);
drop function if exists public.generar_token_invitacion();

drop type if exists public.origen_confirmacion;
drop type if exists public.estado_confirmacion;
drop type if exists public.tipo_menu;
drop type if exists public.evento_boda;
drop type if exists public.lado_invitacion;

commit;
