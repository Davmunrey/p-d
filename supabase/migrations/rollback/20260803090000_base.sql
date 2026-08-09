-- ============================================================================
-- ROLLBACK de 20260803090000_base.sql
-- Tickets: BODA-10 (esquema base y convenciones) · BODA-11 (configuración)
--
-- Deshace exactamente lo que hace su migración, en orden inverso: primero el
-- trigger sobre `auth.users`, después las tablas (de la más dependiente a la
-- más dependida), luego las funciones y por último los enumerados.
--
-- Es el ÚLTIMO rollback que debe ejecutarse: el resto del esquema depende de
-- `public.fijar_actualizado_en()`, `public.es_correo_valido()`,
-- `public.sin_acentos()` y `public.perfiles`.
--
-- Las EXTENSIONES no se eliminan: viven en el esquema `extensions`, son
-- compartidas y otros objetos —o el propio Supabase— pueden estar usándolas.
--
-- Las DEFAULT PRIVILEGES revocadas tampoco se restauran. Devolverle a `anon`
-- el `grant all` sobre toda tabla futura sería reabrir el agujero que la
-- migración cierra, no revertir un cambio. Si de verdad se quisiera volver al
-- estado de fábrica de Supabase (no se recomienda):
--   alter default privileges in schema public grant all on tables to anon, authenticated;
-- ============================================================================

begin;

drop trigger if exists auth_users_sincronizar_perfil on auth.users;

drop table if exists public.secciones_landing;
drop table if exists public.configuracion_privada;
drop table if exists public.configuracion_boda;
drop table if exists public.perfiles;
drop table if exists public.invitaciones_panel;
drop table if exists public.registro_auditoria;
drop table if exists public.campos_auditoria_redactados;

drop function if exists public.impedir_borrado_configuracion();
drop function if exists public.sincronizar_perfil_desde_auth();
drop function if exists public.proteger_privilegios_perfil();
drop function if exists public.registrar_auditoria();
drop function if exists public.redactar_campos_auditados(text, jsonb);
drop function if exists public.es_ruta_almacenamiento_valida(text);
drop function if exists public.es_correo_valido(text);
drop function if exists public.sin_acentos(text);
drop function if exists public.normalizar_correo();
drop function if exists public.fijar_actualizado_en();
drop function if exists public.asegurar_enum(text, text[]);

drop type if exists public.seccion_landing;
drop type if exists public.rol_usuario;
drop type if exists public.operacion_auditoria;

commit;
