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

# SE MIRA EL CÓDIGO DE SALIDA, NO LA SALIDA. Antes era `psql … | grep -q ERROR`
# y, con `pipefail`, el estado de la tubería es el de psql (3 con
# ON_ERROR_STOP) y no el de grep: el `if` salía falso para TODO fallo real y
# la migración rota se daba por buena con su ✓. Reproducido: una migración con
# un error de sintaxis pasaba este bucle en verde. Es la misma clase de fallo
# que se arregló más abajo con el sello SUITE-COMPLETA.
for fichero in $(ls "$COPIA"/*.sql | sort); do
  nombre=$(basename "$fichero")
  if ! salida=$(psqlp "-d $BASE -q -v ON_ERROR_STOP=1 -f $fichero" 2>&1); then
    echo "  ✗ $nombre"
    echo "$salida" | grep -A3 'ERROR' | head -12
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

# EL CÓDIGO DE SALIDA DE psql SE MIRA, y antes no. Con `|| true` se tragaba
# cualquier muerte del intérprete —una conexión caída, un error de sintaxis a
# mitad de fichero— y como no llegaba a imprimir ningún «FALLA», este script
# contestaba «✓ 0 comprobaciones de seguridad en verde» y salía con cero. Un
# paso de CI bloqueante que se ponía verde sin haber demostrado nada.
SALIDA=$(psqlp "-d $BASE -f $SUITE" 2>&1) && CODIGO=0 || CODIGO=$?
rm -f "$SUITE"

echo "$SALIDA" | { grep -E '(OK|FALLA|SIN DATOS) ' || true; } | sed -E 's/^.*(NOTICE|WARNING):  /  /'
echo ""

if [ "$CODIGO" -ne 0 ]; then
  echo "✗ La suite de seguridad no llegó a terminar (psql salió con $CODIGO)."
  echo "$SALIDA" | tail -20
  exit 1
fi

if echo "$SALIDA" | grep -q 'FALLA'; then
  echo "✗ Hay comprobaciones de seguridad en rojo."
  exit 1
fi

# Y EL SELLO DEL FINAL. `ON_ERROR_STOP` está en `off` dentro de la suite —a
# propósito, para que un bloque roto no se lleve por delante los demás—, así que
# psql puede terminar con cero habiendo saltado media suite. La última línea del
# fichero es la única prueba de que se ejecutó entera.
if ! echo "$SALIDA" | grep -q 'SUITE-COMPLETA'; then
  echo "✗ La suite se cortó antes del final: falta el sello SUITE-COMPLETA."
  echo "$SALIDA" | tail -20
  exit 1
fi

CORRECTAS=$(echo "$SALIDA" | { grep -c 'OK  ' || true; })

# Un suelo, para que «se ejecutó entera pero casi todo se saltó» tampoco cuele.
# Se sube cuando se añaden comprobaciones; bajarlo es una decisión, no un
# descuido.
MINIMO=130
if [ "$CORRECTAS" -lt "$MINIMO" ]; then
  echo "✗ Sólo $CORRECTAS comprobaciones en verde, y se esperaban al menos $MINIMO."
  exit 1
fi

echo "✓ $CORRECTAS comprobaciones de seguridad en verde."

# --- Y que el documento del esquema diga la verdad -------------------------
#
# `docs/MODELO-DATOS.md` abre con una línea de cifras: «En números: **N tablas,
# N vistas, …**». Es lo primero que lee quien llega al proyecto, y era el único
# sitio del repositorio donde un número se escribía a mano contra algo que
# cambia solo. Se quedó en «24 tablas» mientras el esquema llegaba a 37, sin que
# nada lo dijera — porque no había nada que pudiera decirlo.
#
# Aquí sí: la base está recién migrada y delante, así que se cuenta y se compara.

DOC="$RAIZ/docs/MODELO-DATOS.md"
LINEA=$(grep -m1 '^En números:' "$DOC" || true)

if [ -z "$LINEA" ]; then
  echo "✗ docs/MODELO-DATOS.md ya no tiene su línea «En números:»."
  exit 1
fi

# La consulta va por fichero y no en un `-c`: `psqlp` mete el comando dentro de
# un `su postgres -c "..."`, así que un SELECT con comillas por medio pasaría por
# dos intérpretes antes de llegar a psql. Es el mismo camino que usa el resto del
# script para todo lo que no cabe en una línea.
TMP_CIFRAS=$(mktemp /tmp/boda-cifras-XXXX.sql)
cat > "$TMP_CIFRAS" <<'SQL'
select 'En números: **'
    || (select count(*) from pg_tables  where schemaname = 'public') || ' tablas, '
    || (select count(*) from pg_views   where schemaname = 'public') || ' vistas, '
    || (select count(*) from pg_type as t
          join pg_namespace as n on n.oid = t.typnamespace
         where n.nspname = 'public' and t.typtype = 'e')             || ' enumerados, '
    || (select count(*) from pg_proc as p
          join pg_namespace as n on n.oid = p.pronamespace
         where n.nspname = 'public')                                 || ' funciones, '
    || (select count(*) from pg_policies where schemaname = 'public')
    || ' políticas RLS.**';
SQL
chmod a+r "$TMP_CIFRAS"
REAL=$(psqlp "-d $BASE -tA -f $TMP_CIFRAS" | tr -d '\r' | sed '/^$/d')
rm -f "$TMP_CIFRAS"

if [ "$LINEA" != "$REAL" ]; then
  echo "✗ Las cifras de docs/MODELO-DATOS.md no son las de la base:"
  echo "    documento: $LINEA"
  echo "    base:      $REAL"
  echo "  Cámbialas en la misma PR que cambia el esquema."
  exit 1
fi

echo "✓ Las cifras de docs/MODELO-DATOS.md cuadran con el esquema."
