-- ============================================================================
-- El retrato de estrellas: la sección y sus estrellas
--
-- LO QUE SE SUBE ES UNA FOTO RECORTADA —un PNG con el fondo transparente, como
-- el que sale en el iPhone al mantener pulsado sobre las personas—, y lo que
-- se guarda, además de la foto, es su contorno hecho estrellas. Lo calcula el
-- panel al subirla (`src/lib/retrato/`), una vez, y la landing sólo lee números:
-- no descarga la foto ni la procesa en cada visita.
--
-- POR QUÉ UN RECORTE Y NO LA FOTO TAL CUAL. Separar a tres figuras del fondo
-- de una foto cualquiera es un problema que no se resuelve bien sin un modelo:
-- un perro blanco sobre nieve blanca, un anorak negro contra pinos oscuros. El
-- recorte lo hace bien el propio móvil, y lo que queda aquí es exacto: trazar
-- el borde de lo que no es transparente.
--
-- Rollback: supabase/migrations/rollback/20261102170100_retrato.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Las estrellas, en la fila de su foto
-- ---------------------------------------------------------------------------

/*
  EN `medios` Y NO EN UNA TABLA APARTE porque son de esa foto y de ninguna
  otra: se borran con ella, se publican con ella y cambian cuando cambia. Una
  tabla propia sería una clave ajena que mantener para una relación uno a uno.

  La forma: `{ "proporcion": ancho/alto, "estrellas": [[x, y, brillo], …] }`,
  con x, y y brillo entre 0 y 1, en el orden en que se trazan.
*/
alter table public.medios
  add column if not exists estrellas jsonb;

comment on column public.medios.estrellas is
  'Sólo en el retrato: el contorno de la foto recortada hecho estrellas, '
  '{ proporcion, estrellas: [[x, y, brillo], …] } en 0..1. Lo calcula el panel '
  'al subir; NULL en cualquier otra foto.';

/*
  Sólo el retrato lleva estrellas, con su forma, y con un tope: el panel pone
  unos cientos, y un tope de bytes impide que una fila de la landing pese
  megas por un error.
*/
alter table public.medios drop constraint if exists medios_estrellas_del_retrato;
alter table public.medios
  add constraint medios_estrellas_del_retrato
  check (
    estrellas is null
    or (
      seccion = 'retrato'
      and jsonb_typeof(estrellas) = 'object'
      and jsonb_typeof(estrellas -> 'proporcion') = 'number'
      and (estrellas ->> 'proporcion')::numeric > 0
      and jsonb_typeof(estrellas -> 'estrellas') = 'array'
      and jsonb_array_length(estrellas -> 'estrellas') between 3 and 2000
      and pg_column_size(estrellas) <= 131072
    )
  );

-- ---------------------------------------------------------------------------
-- 2. La sección, encendida
-- ---------------------------------------------------------------------------

/*
  Entre la historia (20) y la víspera (33). Encendida: sin foto no se pinta
  nada, igual que la galería vacía, así que encenderla no deja ningún hueco.
*/
insert into public.secciones_landing (seccion, visible, orden) values
  ('retrato', true, 25)
on conflict (seccion) do nothing;
