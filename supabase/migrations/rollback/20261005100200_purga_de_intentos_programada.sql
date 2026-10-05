-- Reverso de 20261005100200_purga_de_intentos_programada.sql
--
-- Desprograma la purga nocturna de `intentos_rsvp`. La extensión pg_cron se
-- queda: puede haber otros trabajos usándola, y quitarla no es parte de esto.
-- Sin pg_cron —una base fuera de Supabase— no hay nada que deshacer.

begin;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid)
       from cron.job as j
      where j.jobname = 'purgar-intentos-rsvp';
  end if;
end;
$$;

comment on function public.purgar_intentos_rsvp() is
  'Limpia los intentos antiguos. Se programa con pg_cron; el periodo de retención '
  'es configuración (`parametros_seguridad.dias_retencion_intentos`), no un '
  'literal dentro de la función.';

commit;
