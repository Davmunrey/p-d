-- ============================================================================
-- 20261005100200_purga_de_intentos_programada.sql
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero: programar de verdad la purga de `intentos_rsvp`.
--
--
-- EL FALLO.
--
-- `purgar_intentos_rsvp()` existe desde 20260803090500 y lee
-- `parametros_seguridad.dias_retencion_intentos` (30 por defecto), pero nadie
-- la llamaba: el único `cron.schedule` del repositorio era un comentario de
-- «notas de operación» al final de aquella migración. Así que el ajuste de
-- retención no hacía nada, y cada vez que alguien abre su invitación queda una
-- fila con su IP y la huella de su token, para siempre. Guardar la IP de un
-- invitado más allá de lo que hace falta para el cortafuegos es justo lo que
-- el ajuste quería evitar.
--
--
-- EL ARREGLO, Y POR QUÉ EN LA BASE.
--
-- Con pg_cron, que Supabase trae precargado: la purga vive donde viven los
-- datos y no depende de ningún secreto de GitHub ni de que un flujo programado
-- llegue a ejecutarse. Todas las noches a las 04:30 UTC, que es madrugada en
-- España y lejos de cualquier rato en que alguien esté confirmando.
--
-- Es idempotente: si ya había un trabajo con ese nombre —programado a mano
-- desde el panel de Supabase siguiendo aquella nota—, se sustituye por éste.
--
-- FUERA DE SUPABASE NO SIEMPRE HAY pg_cron. El PostgreSQL del CI y el de
-- desarrollo no lo traen, y la extensión exige estar precargada al arrancar el
-- servidor. Ahí se avisa y se sigue: no hay nada que purgar en una base que se
-- tira al acabar. EN SUPABASE, EN CAMBIO, NO PODER CREARLA ES UN FALLO y se
-- dice: la migración se cae entera antes que dejar la purga sin programar en
-- silencio. Supabase se reconoce por su rol de administración, `supabase_admin`,
-- que existe en todos sus proyectos y en ningún PostgreSQL de serie.
--
-- Rollback: rollback/20261005100200_purga_de_intentos_programada.sql
-- ============================================================================

begin;

do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
      raise;
    end if;
    raise notice 'pg_cron no está disponible en esta base (%): la purga de intentos no se programa aquí.', sqlerrm;
    return;
  end;

  -- Lo que la documentación de Supabase pide tras activar pg_cron para que
  -- `postgres` —el rol con el que corren las migraciones— pueda programar. Si
  -- ya los tenía, no cambia nada.
  grant usage on schema cron to postgres;
  grant all privileges on all tables in schema cron to postgres;

  perform cron.unschedule(j.jobid)
     from cron.job as j
    where j.jobname = 'purgar-intentos-rsvp';

  perform cron.schedule(
    'purgar-intentos-rsvp',
    '30 4 * * *',
    'select public.purgar_intentos_rsvp()'
  );
end;
$$;

comment on function public.purgar_intentos_rsvp() is
  'Limpia los intentos antiguos según parametros_seguridad.dias_retencion_intentos. '
  'La programa pg_cron todas las noches (trabajo «purgar-intentos-rsvp», '
  '20261005100200); el periodo de retención es configuración, no un literal.';

commit;
