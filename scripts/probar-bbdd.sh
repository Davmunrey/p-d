#!/usr/bin/env bash
#
# BODA-14 · Prueba las migraciones y la seguridad contra un Postgres REAL.
#
# No hay mocks: un mock de RLS no demuestra absolutamente nada. Este script
# levanta una base de datos desechable, simula lo que Supabase aporta
# (esquema auth, roles anon/authenticated/service_role, pgcrypto en el esquema
# extensions), aplica todas las migraciones en orden y ejecuta la suite de
# seguridad.
#
# Sale con error si alguna migración falla o si alguna comprobación imprime
# FALLA, así que sirve tal cual como paso de CI.
#
# Uso:  ./scripts/probar-bbdd.sh

set -euo pipefail

PUERTO="${PGPUERTO_PRUEBA:-5433}"
DATOS="${PGDATOS_PRUEBA:-/var/lib/postgresql/pruebaboda}"
BASE=boda_prueba
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$BIN" ] && export PATH="$BIN:$PATH"

command -v initdb >/dev/null || {
  echo "No hay PostgreSQL instalado. Instala postgresql-16 o exporta PATH."
  exit 1
}

comoPostgres() { su postgres -c "PATH=$PATH $*"; }

# --- Servidor desechable ----------------------------------------------------

if ! comoPostgres "pg_ctl -D $DATOS status" >/dev/null 2>&1; then
  echo "▸ Levantando PostgreSQL de pruebas en el puerto $PUERTO"
  rm -rf "$DATOS"
  mkdir -p "$DATOS"
  chown -R postgres:postgres "$(dirname "$DATOS")"
  chmod 700 "$DATOS"
  comoPostgres "initdb -D $DATOS -A trust -E UTF8 --locale=C" >/dev/null
  comoPostgres "pg_ctl -D $DATOS -o '-p $PUERTO -k /tmp' -l $DATOS/log start" >/dev/null
  sleep 2
fi

psqlp() { comoPostgres "psql -h /tmp -p $PUERTO $*"; }

echo "▸ Recreando la base $BASE"
psqlp "-q -c 'drop database if exists $BASE;' -c 'create database $BASE;'" >/dev/null

# --- Lo que Supabase aporta y las migraciones dan por hecho ------------------

echo "▸ Simulando el entorno de Supabase"
TMP_PREVIO=$(mktemp /tmp/boda-previo-XXXX.sql)
cat > "$TMP_PREVIO" <<'SQL'
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$ begin
  if not exists (select from pg_roles where rolname = 'anon')
    then create role anon nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'authenticated')
    then create role authenticated nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'service_role')
    then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
grant usage on schema auth, extensions to anon, authenticated, service_role;

create table if not exists auth.users (
  id                 uuid primary key default extensions.gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
grant select on auth.users to authenticated, service_role;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

-- LO QUE SUPABASE APORTA COMO «STORAGE», EN LO QUE HACE FALTA PARA PROBARLO.
--
-- Sin esto, la migración del bucket revienta contra un PostgreSQL pelado y el
-- trabajo de CI de migraciones no probaría la parte del proyecto que decide
-- quién puede subir una foto. Es el mismo trato que ya se le da a `auth`: no se
-- simula el servicio, se recrean las TABLAS sobre las que actúan las políticas,
-- que son las que se quiere probar.
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  owner_id           text
);

create table if not exists storage.objects (
  id               uuid primary key default extensions.gen_random_uuid(),
  bucket_id        text references storage.buckets (id),
  name             text,
  owner            uuid,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata         jsonb,
  path_tokens      text[],
  version          text,
  owner_id         text,
  user_metadata    jsonb
);

-- Igual que en Supabase: la RLS viene puesta y las políticas las trae la
-- migración. Sin `force`, el propietario de la tabla se las saltaría y la suite
-- de seguridad daría por buena una regla que no se aplica.
alter table storage.objects enable row level security;
alter table storage.objects force row level security;

grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
SQL
chmod a+r "$TMP_PREVIO"
psqlp "-d $BASE -q -v ON_ERROR_STOP=1 -f $TMP_PREVIO"
rm -f "$TMP_PREVIO"

# --- Migraciones ------------------------------------------------------------

echo "▸ Aplicando migraciones"
COPIA=$(mktemp -d /tmp/boda-mig-XXXX)
cp "$RAIZ"/supabase/migrations/*.sql "$COPIA/"
chmod -R a+rX "$COPIA"

for fichero in $(ls "$COPIA"/*.sql | sort); do
  nombre=$(basename "$fichero")
  if psqlp "-d $BASE -q -v ON_ERROR_STOP=1 -f $fichero" 2>&1 | grep -q 'ERROR'; then
    echo "  ✗ $nombre"
    psqlp "-d $BASE -v ON_ERROR_STOP=1 -f $fichero" 2>&1 | grep -A3 'ERROR' | head -12
    rm -rf "$COPIA"
    exit 1
  fi
  echo "  ✓ $nombre"
done
rm -rf "$COPIA"

# --- Datos mínimos para poder probar el flujo -------------------------------

echo "▸ Preparando el primer propietario"
TMP_ARRANQUE=$(mktemp /tmp/boda-arranque-XXXX.sql)
cat > "$TMP_ARRANQUE" <<'SQL'
insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'novios@ejemplo.es')
on conflict (id) do nothing;

begin;
  set local role service_role;
  select public.designar_primer_propietario(
    '11111111-1111-1111-1111-111111111111', 'Propietario de pruebas'
  );
commit;
SQL
chmod a+r "$TMP_ARRANQUE"
psqlp "-d $BASE -q -v ON_ERROR_STOP=1 -f $TMP_ARRANQUE" >/dev/null
rm -f "$TMP_ARRANQUE"

# --- Suite de seguridad -----------------------------------------------------

SUITE=$(mktemp /tmp/boda-suite-XXXX.sql)
{
  echo "set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';"
  cat "$RAIZ/supabase/tests/seguridad.sql"
} > "$SUITE"
chmod a+r "$SUITE"

SALIDA=$(psqlp "-d $BASE -f $SUITE" 2>&1 || true)
rm -f "$SUITE"

echo "$SALIDA" | { grep -E '(OK|FALLA) ' || true; } | sed -E 's/^.*(NOTICE|WARNING):  /  /'
echo ""

if echo "$SALIDA" | grep -q 'FALLA'; then
  echo "✗ Hay comprobaciones de seguridad en rojo."
  exit 1
fi

CORRECTAS=$(echo "$SALIDA" | { grep -c 'OK  ' || true; })
echo "✓ $CORRECTAS comprobaciones de seguridad en verde."
