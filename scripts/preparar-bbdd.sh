#!/usr/bin/env bash
#
# Deja una base de datos lista para desarrollo y para los tests E2E:
# migraciones aplicadas desde cero y seed cargado.
#
# Imprime por la salida estándar la cadena de conexión, para poder hacer:
#
#     export DATABASE_URL="$(./scripts/preparar-bbdd.sh)"
#
# Nada de lo que carga son datos reales de la boda: el seed marca todo con el
# prefijo «(DES)».

set -euo pipefail

PUERTO="${PGPUERTO_PRUEBA:-5433}"
DATOS="${PGDATOS_PRUEBA:-/var/lib/postgresql/pruebaboda}"
BASE="${PGBASE_PRUEBA:-boda_desarrollo}"
CLAVE="${PGCLAVE_PRUEBA:-pruebas}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$BIN" ] && export PATH="$BIN:$PATH"

comoPostgres() { su postgres -c "PATH=$PATH $*"; }
psqlp() { comoPostgres "psql -h /tmp -p $PUERTO $*"; }

if ! comoPostgres "pg_ctl -D $DATOS status" >/dev/null 2>&1; then
  rm -rf "$DATOS"
  mkdir -p "$DATOS"
  chown -R postgres:postgres "$(dirname "$DATOS")"
  chmod 700 "$DATOS"
  comoPostgres "initdb -D $DATOS -A trust -E UTF8 --locale=C" >/dev/null
  comoPostgres "pg_ctl -D $DATOS -o '-p $PUERTO -k /tmp' -l $DATOS/log start" >/dev/null
  sleep 2
fi >&2

psqlp "-q -c 'drop database if exists $BASE;' -c 'create database $BASE;'" >/dev/null 2>&1
psqlp "-q -c \"alter role postgres with password '$CLAVE';\"" >/dev/null 2>&1

# Lo que Supabase aporta y las migraciones dan por hecho.
PREVIO=$(mktemp /tmp/boda-previo-XXXX.sql)
cat > "$PREVIO" <<'SQL'
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
create schema if not exists auth;
grant usage on schema auth, extensions to anon, authenticated, service_role;
create table if not exists auth.users (
  id uuid primary key default extensions.gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
grant select on auth.users to authenticated, service_role;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
SQL
chmod a+r "$PREVIO"
psqlp "-d $BASE -q -v ON_ERROR_STOP=1 -f $PREVIO" >&2
rm -f "$PREVIO"

COPIA=$(mktemp -d /tmp/boda-mig-XXXX)
cp "$RAIZ"/supabase/migrations/*.sql "$COPIA/"
cp "$RAIZ"/supabase/seed.sql "$COPIA/zzz_seed.sql"
chmod -R a+rX "$COPIA"

for fichero in $(ls "$COPIA"/*.sql | sort); do
  psqlp "-d $BASE -q -v ON_ERROR_STOP=1 -f $fichero" >&2
done
rm -rf "$COPIA"

echo "postgres://postgres:$CLAVE@127.0.0.1:$PUERTO/$BASE"
