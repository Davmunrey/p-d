-- ============================================================================
-- «Mientras estáis por aquí»: planes por León
--
-- Unos pocos planes por la zona para quien viene de fuera —«subid a la
-- catedral al atardecer», «tapead en el Húmedo»—, cada uno con una foto
-- vuestra allí. Es una lista más de Contenido, como el dress code o los
-- hoteles: un título, un texto y una foto elegida entre las subidas a la
-- sección «Planes» de Fotos y vídeos.
--
-- Misma seguridad que el resto del contenido de la landing: `anon` sólo lee lo
-- publicado, y sólo quien puede editar escribe.
-- ============================================================================

begin;

create table if not exists public.planes (
  id             uuid primary key default extensions.gen_random_uuid(),
  titulo         text        not null,
  texto          text,
  medio_id       uuid references public.medios (id) on delete set null,
  orden          smallint    not null default 0,
  publicado      boolean     not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint planes_titulo_longitud check (char_length(btrim(titulo)) between 1 and 120),
  constraint planes_texto_longitud
    check (texto is null or char_length(btrim(texto)) between 1 and 600)
);

comment on table public.planes is
  'Planes por la zona para los invitados que vienen de fuera, con una foto de '
  'los novios en cada sitio. Sección «planes» de la landing.';

create or replace trigger trg_planes_actualizado_en
  before update on public.planes
  for each row when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();

create index if not exists idx_planes_orden on public.planes (orden) where publicado;
create index if not exists idx_planes_medio on public.planes (medio_id);

alter table public.planes enable row level security;
alter table public.planes force row level security;

-- Se cierra todo y se abre sólo lo justo: el default concede de más.
revoke all on public.planes from public, anon, authenticated;
grant select on public.planes to anon, authenticated;
grant insert, update, delete on public.planes to authenticated;

drop policy if exists planes_lectura_publica on public.planes;
create policy planes_lectura_publica on public.planes
  for select to anon, authenticated using (publicado);

drop policy if exists planes_gestion on public.planes;
create policy planes_gestion on public.planes
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

/*
  Justo antes de la llegada: después del dress code (77) y antes de dónde
  dormir, que la página pone siempre al final. Encendida: sin planes escritos
  no se pinta nada, así que encenderla no deja ningún hueco.
*/
insert into public.secciones_landing (seccion, visible, orden) values
  ('planes', true, 78)
on conflict (seccion) do nothing;

commit;
