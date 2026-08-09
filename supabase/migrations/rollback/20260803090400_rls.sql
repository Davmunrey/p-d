-- ============================================================================
-- ROLLBACK de 20260803090400_rls.sql
-- Ticket: BODA-14 (políticas RLS, privilegios y límite de intentos)
--
-- Deshace exactamente lo que hace su migración, en orden inverso:
--   1. Se quita `force row level security`.
--   2. Se eliminan todas las políticas.
--   3. Se revocan los privilegios concedidos.
--   4. Se eliminan las funciones de rol.
--   5. Se eliminan las tablas de seguridad.
--
-- LÉASE ANTES DE EJECUTARLO: al terminar, las tablas conservan RLS ACTIVADO y
-- se quedan SIN NINGUNA POLÍTICA, que es el estado seguro (nadie lee, nadie
-- escribe) y el mismo en el que las dejan las migraciones de esquema. El panel
-- dejará de funcionar por completo hasta que se reaplique esta migración: eso
-- es lo correcto, no un efecto secundario que haya que compensar.
--
-- Las funciones de rol se eliminan con CASCADE porque las políticas que las
-- usan ya se han borrado en el paso 2; si quedara alguna, el CASCADE se la
-- llevaría, y por eso el orden importa.
-- ============================================================================

begin;

-- 1. Quitar el forzado de RLS ------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'configuracion_privada', 'secciones_landing', 'notas_grupo', 'notas_invitado',
    'categorias_proveedor', 'proveedores', 'documentos_proveedor', 'servicios',
    'categorias_presupuesto', 'partidas_presupuesto', 'pagos', 'tareas', 'mesas',
    'medios'
  ]
  loop
    execute format('alter table if exists public.%I no force row level security', v_tabla);
  end loop;
end;
$$;

-- 2. Eliminar todas las políticas del esquema público -------------------------
do $$
declare
  v_politica record;
begin
  for v_politica in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I',
                   v_politica.policyname, v_politica.schemaname, v_politica.tablename);
  end loop;
end;
$$;

-- 3. Revocar los privilegios --------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

revoke execute on function public.alta_declarada() from authenticated;
revoke execute on function public.rol_declarado()  from authenticated;
revoke execute on function public.es_propietario() from authenticated;
revoke execute on function public.puede_editar()   from authenticated;
revoke execute on function public.puede_leer()     from authenticated;
revoke execute on function public.rol_actual()     from authenticated;

-- 4. Funciones de rol ---------------------------------------------------------
-- CASCADE: `congelar_privilegios_grupo()` (BODA-12) y las funciones públicas del
-- RSVP invocan `puede_editar()`. Sus cuerpos son PL/pgSQL, así que no se
-- registra dependencia y el DROP no las arrastra; quedan válidas y fallarán en
-- tiempo de ejecución hasta que se reaplique esta migración. Es coherente con
-- dejar el esquema cerrado.
drop function if exists public.alta_declarada();
drop function if exists public.rol_declarado();
drop function if exists public.es_propietario();
drop function if exists public.puede_editar();
drop function if exists public.puede_leer();
drop function if exists public.rol_actual();

-- 5. Tablas de la capa de seguridad -------------------------------------------
drop table if exists public.intentos_rsvp;
drop table if exists public.parametros_seguridad;

commit;
