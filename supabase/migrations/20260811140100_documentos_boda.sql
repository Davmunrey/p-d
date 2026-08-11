-- ============================================================================
-- 20260811140100_documentos_boda.sql
-- Ticket: BODA-105 (#129) · Los papeles de la boda civil, con sus caducidades
--
-- Qué hace este fichero:
--   1. `documentos_boda`: el expediente civil, papel a papel, con su fecha de
--      obtención y su fecha de caducidad.
--   2. Sus privilegios y sus políticas RLS. Aquí dentro hay DNI y certificados
--      de nacimiento: `anon` no tiene absolutamente nada.
--
-- POR QUÉ NO ES UNA TAREA. Una tarea se hace y se acaba; un papel se consigue
-- y EMPIEZA A MORIRSE. La partida de nacimiento caduca a los tres meses y una
-- boda se prepara con año y medio de antelación: el error que nadie ve venir
-- es pedirla pronto, archivarla, y llegar con ella caducada al expediente.
-- Modelar eso exige saber desde cuándo vale y hasta cuándo — una fecha límite
-- de tarea no lo dice.
--
-- SIN SEMILLA, y es una decisión y no una omisión. La lista de papeles varía
-- por comunidad autónoma y según se tramite en Registro Civil o en notaría;
-- sembrar aquí una lista inventada sería el hardcode de la regla 1 disfrazado
-- de datos. La semilla entra cuando los novios o la wedding planner confirmen
-- la lista real (queda dicho en #129).
--
-- Rollback: supabase/migrations/rollback/20260811140100_documentos_boda.sql
-- ============================================================================

begin;

create table if not exists public.documentos_boda (
  id             uuid not null default gen_random_uuid(),

  titulo         text not null,
  -- De quién es el papel. En el expediente civil casi todo se pide por
  -- duplicado —uno por contrayente— y la primera pregunta al repasar la
  -- carpeta es siempre «¿el tuyo o el mío?».
  de_quien       public.titular_documento not null,
  -- Dónde se pide: «Registro Civil de León», «sede electrónica del INE». Es
  -- texto libre porque cada papel tiene su ventanilla y no hay dos iguales.
  donde_se_pide  text,
  notas          text,

  estado         public.estado_documento_boda not null default 'pendiente',
  -- Cuándo se consiguió. No se borra al conseguirlo: sin esta fecha no se
  -- puede saber cuándo caduca, que es el motivo de que el módulo exista.
  obtenido_en    date,
  -- Hasta cuándo vale. NULL significa «no caduca» (un DNI en vigor de sobra,
  -- una declaración jurada del mismo mes), no «no se sabe».
  caduca_en      date,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint documentos_boda_pk primary key (id),

  constraint documentos_boda_titulo_longitud
    check (length(btrim(titulo)) between 1 and 160),
  constraint documentos_boda_donde_longitud
    check (donde_se_pide is null or char_length(donde_se_pide) <= 200),
  constraint documentos_boda_notas_longitud
    check (notas is null or char_length(notas) <= 2000),

  -- Conseguido y fecha de obtención van juntos en las dos direcciones: un
  -- «conseguido» sin fecha no permite calcular la caducidad, y una fecha en un
  -- papel pendiente es un dato que alguien olvidó limpiar.
  constraint documentos_boda_conseguido_con_fecha
    check ((estado = 'conseguido') = (obtenido_en is not null)),

  -- Un papel no puede caducar antes de existir.
  constraint documentos_boda_caducidad_coherente
    check (caduca_en is null or obtenido_en is null or caduca_en >= obtenido_en)
);
alter table public.documentos_boda enable row level security;

comment on table public.documentos_boda is
  'El expediente de la boda civil, papel a papel. Es la hoja PAPELES BODA del '
  'Excel de la wedding planner, con lo que al Excel le faltaba: desde cuándo '
  'vale cada papel y hasta cuándo.';
comment on column public.documentos_boda.caduca_en is
  'El aviso que importa se calcula contra esta fecha y la de la boda: un papel '
  'que caduca ANTES del enlace hay que volver a pedirlo, aunque esté conseguido.';

create index if not exists documentos_boda_pendientes_idx
  on public.documentos_boda (estado, caduca_en nulls last);

create or replace trigger documentos_boda_actualizado_en
  before update on public.documentos_boda
  for each row
  when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();

create or replace trigger documentos_boda_auditoria
  after insert or update or delete on public.documentos_boda
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------------
-- Privilegios y políticas
-- ---------------------------------------------------------------------------
--
-- Se enumeran las operaciones en lugar de conceder `all`: `all` incluye
-- TRUNCATE, y RLS no se aplica a TRUNCATE.

grant select on public.documentos_boda to authenticated;
grant insert, update, delete on public.documentos_boda to authenticated;

drop policy if exists documentos_boda_leer on public.documentos_boda;
create policy documentos_boda_leer on public.documentos_boda
  for select to authenticated
  using ((select public.puede_leer()));

drop policy if exists documentos_boda_escribir on public.documentos_boda;
create policy documentos_boda_escribir on public.documentos_boda
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

alter table public.documentos_boda force row level security;

commit;
