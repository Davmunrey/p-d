-- Reverso de 20260919130000_forzar_rls_mensajes_leidos.sql
--
-- Devuelve `mensajes_leidos` a `enable` sin `force`, que es como estaba. La
-- tabla, sus políticas y sus privilegios no se tocan: esto sólo cambia si la
-- RLS se le aplica también al propietario.

alter table public.mensajes_leidos no force row level security;
