-- ============================================================================
-- Qué incluye cada alojamiento, y hasta cuándo se reserva
--
-- Dos datos que el invitado busca antes de reservar y que no había dónde
-- escribir:
--
--   · `incluye`: lo que trae el precio y lo que no —«Parking incluido»,
--     «Desayuno no incluido»—, una cosa por línea. Se pinta como etiquetas
--     junto al hotel. Es texto y no un `text[]` porque se escribe en un
--     párrafo del panel, una por línea, y así lo lee quien lo escribe.
--   · `fecha_limite_reserva`: hasta cuándo aguanta el hotel las habitaciones
--     bloqueadas. Cada hotel tiene la suya; antes la landing ponía la de
--     confirmar asistencia, que no tiene por qué coincidir.
--
-- Las dos son opcionales: un hotel sin ellas se pinta como hasta ahora.
-- ============================================================================

begin;

alter table public.alojamientos
  add column if not exists incluye text,
  add column if not exists fecha_limite_reserva date;

alter table public.alojamientos
  drop constraint if exists alojamientos_incluye_longitud;

alter table public.alojamientos
  add constraint alojamientos_incluye_longitud
    check (incluye is null or char_length(btrim(incluye)) between 1 and 600);

comment on column public.alojamientos.incluye is
  'Lo que incluye (o no) la tarifa, una cosa por línea: «Parking incluido», '
  '«Desayuno no incluido». La landing pinta cada línea como una etiqueta.';

comment on column public.alojamientos.fecha_limite_reserva is
  'Hasta cuándo guarda el hotel las habitaciones bloqueadas para la boda. '
  'NULL es «sin plazo propio».';

commit;
