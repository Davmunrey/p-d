-- ============================================================================
-- 20260918100000_reordenar_seccion_landing.sql
-- Ticket: BODA-128 (#166)
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero: permite mover una sección de la landing arriba o abajo
-- desde el panel, en una sola transacción.
--
--
-- POR QUÉ NO VALEN DOS `UPDATE` DESDE EL PANEL.
--
-- `secciones_landing_orden_unico` es `deferrable initially deferred`, y la
-- migración base lo puso así «para poder permutar dos secciones en una sola
-- transacción sin pasar por valores intermedios ficticios». Diferida significa
-- «se comprueba al COMMIT», no «no se comprueba»: dos llamadas por PostgREST
-- son DOS transacciones, y la primera acaba con dos filas compartiendo orden,
-- así que su commit revienta igual que si la restricción fuera inmediata.
--
-- La condición de la permuta no es que la comprobación se retrase: es que las
-- dos escrituras caigan DENTRO del mismo commit. Desde el cliente eso no se
-- puede pedir. De ahí esta función.
--
-- Es la hermana de `reordenar_medio()` (BODA-29) y se parece a propósito: el
-- problema es el mismo y la solución tiene que leerse igual.
--
--
-- SECURITY INVOKER, QUE ES LO QUE LA HACE SEGURA.
--
-- No eleva nada. Los dos `UPDATE` corren con la identidad de quien llama, así
-- que decide `secciones_landing_editor_actualizar`, que exige `puede_editar()`.
-- Un lector que llame a esto no mueve nada — y se entera, porque la
-- comprobación de filas tocadas convierte el silencio de RLS en un error con
-- nombre.
--
-- Rollback: supabase/migrations/rollback/20260918100000_reordenar_seccion_landing.sql
-- ============================================================================

begin;

create or replace function public.reordenar_seccion_landing(
  p_seccion       public.seccion_landing,
  p_hacia_arriba  boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_orden    smallint;
  v_vecina   public.seccion_landing;
  v_orden_v  smallint;
  v_tocadas  integer;
begin
  -- El SELECT va también por RLS. Un colaborador ve las dieciséis
  -- (`secciones_landing_colaborador_leer`); alguien sin perfil no ve ninguna, y
  -- para él esto sale directamente como «no existe».
  select s.orden
    into v_orden
    from public.secciones_landing as s
   where s.seccion = p_seccion;

  if not found then
    raise exception 'SEC01'
      using errcode = 'no_data_found',
            hint    = 'Esa sección no existe, o no se tiene acceso a ella.';
  end if;

  /*
    LA VECINA ES LA SIGUIENTE POR ORDEN, NO LA DE `orden ± 1`.

    Los órdenes no son consecutivos y nunca lo han sido: los valores que trae la
    base son 0, 5, 10, 20, 33, 35, 36, 40, 50, 60, 70, 75, 76, 77, 80 y 90 — con
    huecos dejados a propósito para poder colar una sección nueva entre dos sin
    renumerar el mundo. Buscando `orden - 1` no habría vecina casi nunca y el
    botón no haría nada, sin decir por qué.
  */
  if p_hacia_arriba then
    select s.seccion, s.orden into v_vecina, v_orden_v
      from public.secciones_landing as s
     where s.orden < v_orden
     order by s.orden desc
     limit 1;
  else
    select s.seccion, s.orden into v_vecina, v_orden_v
      from public.secciones_landing as s
     where s.orden > v_orden
     order by s.orden asc
     limit 1;
  end if;

  -- Ya está arriba del todo (o abajo del todo). No es un error: es que no hay a
  -- dónde moverla, y la pantalla ya no pinta ese botón.
  if v_vecina is null then
    return;
  end if;

  -- Las dos escrituras, dentro del mismo commit. Es lo único que hace legal el
  -- estado intermedio en el que ambas filas comparten orden.
  update public.secciones_landing set orden = v_orden_v where seccion = p_seccion;
  get diagnostics v_tocadas = row_count;

  /*
    RLS NO DA ERROR AL PROHIBIR UNA ESCRITURA: devuelve cero filas tocadas. Sin
    esta comprobación, un lector pulsaba «subir», no pasaba nada, y la pantalla
    le decía «movida». Se levanta a propósito para que la transacción entera se
    deshaga: media permuta es peor que ninguna.
  */
  if v_tocadas = 0 then
    raise exception 'SEC02'
      using errcode = 'insufficient_privilege',
            hint    = 'Sólo un editor puede reordenar las secciones de la landing.';
  end if;

  update public.secciones_landing set orden = v_orden where seccion = v_vecina;
  get diagnostics v_tocadas = row_count;

  if v_tocadas = 0 then
    raise exception 'SEC02'
      using errcode = 'insufficient_privilege',
            hint    = 'Sólo un editor puede reordenar las secciones de la landing.';
  end if;
end;
$$;

comment on function public.reordenar_seccion_landing(public.seccion_landing, boolean) is
  'Intercambia una sección de la landing con la de al lado. Existe porque la '
  'unicidad de `orden` es diferida y una permuta necesita las dos escrituras en '
  'el MISMO commit, cosa que dos llamadas por PostgREST no pueden dar. SECURITY '
  'INVOKER: quien decide es `secciones_landing_editor_actualizar`, no esta '
  'función. Códigos: SEC01 la sección no existe, SEC02 sin permiso.';

-- `anon` no reordena nada: esto es del panel.
revoke execute on function public.reordenar_seccion_landing(public.seccion_landing, boolean)
  from public, anon;
grant execute on function public.reordenar_seccion_landing(public.seccion_landing, boolean)
  to authenticated;

commit;
