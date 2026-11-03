-- Rollback de 20261103160000_fuera_hitos_de_la_vispera.sql
--
-- Vuelven los tres hitos de la víspera como los sembró
-- 20260810210000_datos_de_la_boda.sql, y sólo si no hay ninguno: si alguien ha
-- escrito otros, mandan los suyos. La web no los pinta mientras la víspera
-- sea un lugar.
begin;

insert into public.hitos_programa (momento, hora, titulo, descripcion, orden)
select * from (values
  ('preboda'::public.momento_programa, '18:00', 'Visita a la catedral',
   'Los que lleguéis pronto, quedamos en la puerta oeste. Media hora larga y merece cada minuto.', 0::smallint),
  ('preboda', '20:30', 'Vinos por el Barrio Húmedo',
   'Ruta corta de tapa y vino sin plan fijo. Empezamos en la Plaza de San Martín.', 10),
  ('preboda', '22:30', 'Cena informal',
   'Mesa reservada a nombre de David. Avisadnos por WhatsApp si os apuntáis para ampliarla.', 20)
) as nuevos
where not exists (select 1 from public.hitos_programa where momento = 'preboda');

commit;
