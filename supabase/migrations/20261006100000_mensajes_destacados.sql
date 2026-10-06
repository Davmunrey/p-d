-- ============================================================================
-- BODA-112 · Destacar los mensajes que avisan de algo práctico
--
-- El ticket lo pedía y se quedó sin hacer: entre treinta «¡qué ganas!» llega un
-- «la abuela es celíaca» o un «llegamos a mitad de la ceremonia», y eso no
-- puede perderse en la bandeja en cuanto se marca como leído. Destacarlo lo
-- deja a la vista —y filtrable— hasta que alguien lo quite.
--
-- TABLA APARTE, COMO `mensajes_leidos` Y POR LO MISMO: `confirmaciones` es
-- inmutable (trigger `confirmaciones_inmutables`, CNF01) y una columna nueva
-- quedaría bajo esa protección. Además es una anotación nuestra sobre lo que
-- contestó el invitado, no parte de su respuesta.
--
-- Nace con `force row level security` —la regla que vigila la suite de
-- seguridad— y sin ningún privilegio para `anon`: es del panel.
--
-- Rollback: supabase/migrations/rollback/20261006100000_mensajes_destacados.sql
-- ============================================================================

create table if not exists public.mensajes_destacados (
  confirmacion_id uuid        not null,
  destacado_por   uuid        not null,
  destacado_en    timestamptz not null default now(),

  constraint mensajes_destacados_pk primary key (confirmacion_id),

  -- La marca no tiene sentido sin el mensaje que marcaba.
  constraint mensajes_destacados_confirmacion_fk
    foreign key (confirmacion_id) references public.confirmaciones (id) on delete cascade,

  constraint mensajes_destacados_perfil_fk
    foreign key (destacado_por) references public.perfiles (usuario_id) on delete cascade
);

comment on table public.mensajes_destacados is
  'Mensajes de invitados destacados desde el panel porque avisan de algo '
  'práctico (una alergia, una llegada tarde). Tabla aparte porque '
  '`confirmaciones` es inmutable por diseño, como `mensajes_leidos`.';

comment on column public.mensajes_destacados.confirmacion_id is
  'Clave primaria: un mensaje está destacado o no. Quién lo destacó es dato, no '
  'identidad — lo que destaca uno de los novios lo ve destacado el otro.';

alter table public.mensajes_destacados enable row level security;
alter table public.mensajes_destacados force row level security;

-- Una tabla nueva nace sin privilegios (la base revoca todo en `public`): sin
-- esto, la política no tendría sobre qué actuar y la lectura fallaría.
grant select on public.mensajes_destacados to authenticated;
grant insert, update, delete on public.mensajes_destacados to authenticated;

drop policy if exists mensajes_destacados_colaborador_leer on public.mensajes_destacados;
create policy mensajes_destacados_colaborador_leer on public.mensajes_destacados
  for select to authenticated using ((select public.puede_leer()));

drop policy if exists mensajes_destacados_editor_escribir on public.mensajes_destacados;
create policy mensajes_destacados_editor_escribir on public.mensajes_destacados
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));
