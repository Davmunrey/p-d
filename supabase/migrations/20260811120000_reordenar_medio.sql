-- ============================================================================
-- BODA-29 · PERMUTAR DOS MEDIOS DE SITIO, EN UNA SOLA TRANSACCIÓN
--
-- El orden de las fotos de una sección lo lleva `medios.orden`, con una
-- unicidad `(seccion, orden)` que es DEFERRABLE INITIALLY DEFERRED — puesta en
-- la migración original precisamente «para poder permutar dos imágenes en una
-- sola transacción sin pasar por valores intermedios ficticios».
--
-- POR QUÉ NO VALE HACERLO DESDE EL PANEL CON DOS `UPDATE`. Diferida significa
-- «se comprueba al COMMIT», no «no se comprueba». Dos llamadas por PostgREST
-- son dos transacciones, y la primera acaba con dos filas compartiendo el mismo
-- orden: la unicidad salta en su commit, exactamente igual que si no fuera
-- diferida. La condición de la permuta no es que la comprobación se retrase, es
-- que las dos escrituras estén DENTRO del mismo commit — y desde el cliente eso
-- no se puede pedir.
--
-- De ahí esta función: una llamada, una transacción, las dos filas dentro.
--
-- SECURITY INVOKER, que es lo que la hace segura de verdad. No eleva nada: los
-- dos `UPDATE` se ejecutan con la identidad de quien llama, así que
-- `medios_editor_escribir` —que exige `puede_editar()`— decide. Un lector que
-- llame a esta función no mueve nada y se entera: la comprobación de filas
-- tocadas de más abajo lo convierte en un error con nombre en vez de en un
-- silencio.
--
-- Rollback: supabase/migrations/rollback/20260811120000_reordenar_medio.sql
-- ============================================================================

create or replace function public.reordenar_medio(
  p_medio_id      uuid,
  p_hacia_arriba  boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_seccion  public.seccion_landing;
  v_orden    smallint;
  v_vecino   uuid;
  v_orden_v  smallint;
  v_tocadas  integer;
begin
  -- El SELECT va también por RLS: un lector no ve más de lo que ya veía, y
  -- alguien sin perfil no ve nada, así que aquí sale directamente «no existe».
  select m.seccion, m.orden
    into v_seccion, v_orden
    from public.medios as m
   where m.id = p_medio_id;

  if not found then
    raise exception 'MED02'
      using errcode = 'no_data_found',
            hint    = 'Ese medio no existe, o no se tiene acceso a él.';
  end if;

  /*
    EL VECINO ES EL SIGUIENTE POR ORDEN, NO EL DE `orden ± 1`.

    Los órdenes no tienen por qué ser consecutivos: basta borrar una foto de en
    medio para que queden 0, 1, 3. Buscando `orden - 1` no habría vecino y el
    botón no haría nada, sin decir por qué. Buscando el inmediato anterior
    siempre se encuentra al de al lado, que es lo que quiere quien pulsa.
  */
  if p_hacia_arriba then
    select m.id, m.orden into v_vecino, v_orden_v
      from public.medios as m
     where m.seccion = v_seccion and m.orden < v_orden
     order by m.orden desc
     limit 1;
  else
    select m.id, m.orden into v_vecino, v_orden_v
      from public.medios as m
     where m.seccion = v_seccion and m.orden > v_orden
     order by m.orden asc
     limit 1;
  end if;

  -- Ya está arriba del todo (o abajo del todo). No es un error: es que no hay
  -- a dónde moverlo, y la pantalla ya no pinta ese botón.
  if v_vecino is null then
    return;
  end if;

  -- Las dos escrituras, dentro del mismo commit. Es lo único que hace legal el
  -- estado intermedio en el que ambas filas comparten orden.
  update public.medios set orden = v_orden_v where id = p_medio_id;
  get diagnostics v_tocadas = row_count;

  /*
    RLS NO DA ERROR AL PROHIBIR UNA ESCRITURA: devuelve cero filas tocadas. Sin
    esta comprobación, un lector pulsaba «subir», no pasaba nada, y la pantalla
    le decía «movido». Se levanta a propósito para que la transacción entera se
    deshaga: media permuta es peor que ninguna.
  */
  if v_tocadas = 0 then
    raise exception 'MED03'
      using errcode = 'insufficient_privilege',
            hint    = 'Sólo un editor puede reordenar los medios.';
  end if;

  update public.medios set orden = v_orden where id = v_vecino;
  get diagnostics v_tocadas = row_count;

  if v_tocadas = 0 then
    raise exception 'MED03'
      using errcode = 'insufficient_privilege',
            hint    = 'Sólo un editor puede reordenar los medios.';
  end if;
end;
$$;

comment on function public.reordenar_medio(uuid, boolean) is
  'Intercambia un medio con el de al lado dentro de su sección. Existe porque la '
  'unicidad (seccion, orden) es diferida y una permuta necesita las dos '
  'escrituras en el MISMO commit, cosa que dos llamadas por PostgREST no pueden '
  'dar. SECURITY INVOKER: quien decide es `medios_editor_escribir`, no esta '
  'función.';

-- `anon` no reordena nada: esto es del panel.
revoke execute on function public.reordenar_medio(uuid, boolean) from public, anon;
grant  execute on function public.reordenar_medio(uuid, boolean) to authenticated;
