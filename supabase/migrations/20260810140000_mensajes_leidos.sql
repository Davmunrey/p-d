-- ============================================================================
-- BODA-112 · Marcar un mensaje como leído
--
-- La confirmación deja un hueco para escribir a los novios y ese texto no lo
-- lee nadie, que es tanto como no haberlo pedido. La bandeja necesita saber
-- cuáles ya se han visto — con ciento veinte invitaciones, «nuevo» es la única
-- forma de que la bandeja siga sirviendo en marzo.
--
-- POR QUÉ UNA TABLA APARTE Y NO UNA COLUMNA EN `confirmaciones`
--
-- Porque `confirmaciones` es inmutable, y a propósito: el trigger
-- `confirmaciones_inmutables` compara la fila entera menos `es_vigente` y
-- `actualizado_en`, así que **cualquier** columna nueva quedaría bajo esa
-- protección. Marcar un mensaje como leído fallaría con CNF01.
--
-- Y está bien que sea así. Que alguien haya leído un mensaje no es parte de lo
-- que ese invitado contestó: es una anotación nuestra sobre su respuesta. Son
-- dos hechos distintos y viven en dos sitios distintos.
--
-- Rollback: supabase/migrations/rollback/20260810140000_mensajes_leidos.sql
-- ============================================================================

create table if not exists public.mensajes_leidos (
  confirmacion_id uuid        not null,
  leido_por       uuid        not null,
  leido_en        timestamptz not null default now(),

  constraint mensajes_leidos_pk primary key (confirmacion_id),

  -- Si la confirmación desaparece —al borrarse el invitado y su grupo— la marca
  -- se va con ella: no tiene sentido sin el mensaje que marcaba.
  constraint mensajes_leidos_confirmacion_fk
    foreign key (confirmacion_id) references public.confirmaciones (id) on delete cascade,

  constraint mensajes_leidos_perfil_fk
    foreign key (leido_por) references public.perfiles (usuario_id) on delete cascade
);

comment on table public.mensajes_leidos is
  'Qué mensajes de invitados ya se han leído, y quién. Tabla aparte porque '
  '`confirmaciones` es inmutable por diseño: una columna nueva ahí caería bajo '
  'el trigger de protección del histórico y no se podría escribir. Además son '
  'dos hechos distintos — lo que contestó el invitado, y lo que hemos hecho '
  'nosotros con su mensaje.';

comment on column public.mensajes_leidos.confirmacion_id is
  'Clave primaria: un mensaje se lee o no se lee. Quién lo marcó se guarda como '
  'dato, no como parte de la identidad — que lo lea Paloma no deja el mensaje '
  'sin leer para David.';

alter table public.mensajes_leidos enable row level security;

-- Lo ve quien tiene acceso al panel, y lo escribe quien puede editar. Es la
-- misma línea que el resto del panel: un lector lee la bandeja y no la marca.
--
-- El `drop ... if exists` delante no es adorno: `create policy` no admite
-- `if not exists`, así que una migración que muriera a mitad —o que se
-- reaplicara— se caería aquí con «policy already exists» y habría que limpiar a
-- mano. Con esto se puede reintentar.
drop policy if exists mensajes_leidos_colaborador_leer on public.mensajes_leidos;
create policy mensajes_leidos_colaborador_leer on public.mensajes_leidos
  for select to authenticated using ((select public.puede_leer()));

drop policy if exists mensajes_leidos_editor_escribir on public.mensajes_leidos;
create policy mensajes_leidos_editor_escribir on public.mensajes_leidos
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));
