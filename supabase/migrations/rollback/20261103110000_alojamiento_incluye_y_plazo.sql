-- Rollback de 20261103110000_alojamiento_incluye_y_plazo.sql
--
-- Se van las dos columnas, y con ellas lo escrito: lo que incluye cada hotel
-- y su plazo de reserva.
begin;

alter table public.alojamientos
  drop constraint if exists alojamientos_incluye_longitud,
  drop column if exists incluye,
  drop column if exists fecha_limite_reserva;

commit;
