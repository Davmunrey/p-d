#!/usr/bin/env bash
#
# APLICAR LAS MIGRACIONES PENDIENTES HABLANDO DIRECTO CON POSTGRES
#
# Es el camino de repuesto del flujo `migraciones.yml`, que normalmente usa el
# CLI de Supabase. El CLI necesita `SUPABASE_ACCESS_TOKEN`, que es un token
# personal y CADUCA; cuando caducó, `supabase link` empezó a responder
# «Unauthorized» y el flujo murió antes de tocar la base. Dos merges salieron a
# producción con el esquema viejo detrás y la web se quedó en la pantalla de
# respaldo, porque el código pedía una columna que aún no existía.
#
# Este camino no usa ese token: usa `DATABASE_URL`, la misma cadena de conexión
# que ya emplea `mantener-viva.yml`. Un token personal que caduca no puede ser
# lo único que separe a producción de quedarse atrás.
#
# QUÉ HACE, EXACTAMENTE: lee de `supabase_migrations.schema_migrations` qué
# versiones están aplicadas, y ejecuta en orden las que falten. Cada fichero de
# migración trae su propio `begin`/`commit`, así que o entra entera o no entra.
#
# EL TOPE NO ES BUROCRACIA. Si la tabla de control estuviera vacía o no se
# pudiera leer, este script creería que no hay NADA aplicado e intentaría
# rehacer el esquema entero sobre una base con datos de verdad. Por eso se
# planta si hay más de `MAXIMO_PENDIENTES` por aplicar: el caso normal son una o
# dos, y una cifra alta significa que la lectura está mal, no que haya trabajo.
# Para el caso legítimo (una base nueva) está `FORZAR=si`.
#
# Uso:
#   DATABASE_URL="postgres://..." ./scripts/aplicar-migraciones.sh
#   DATABASE_URL="postgres://..." FORZAR=si ./scripts/aplicar-migraciones.sh

set -euo pipefail

# ---------------------------------------------------------------------------
# La cadena de conexión: la que haya, o la que se pueda armar
#
# `DATABASE_URL` es lo preferente, pero puede no estar: en este repositorio no
# estaba, y eso dejó el camino de repuesto sin camino. Antes de rendirse se
# intenta construirla con los dos secretos que SÍ existen, porque son los que
# el flujo de migraciones ya necesita de todas formas: el identificador del
# proyecto y la contraseña de la base.
#
# `db.<ref>.supabase.co` es la conexión directa de Supabase, la que no pasa por
# el agrupador y por tanto no necesita saber la región — que es justo el dato
# que no se puede deducir del identificador. En proyectos recientes ese nombre
# resuelve sólo por IPv6 y un runner de GitHub no llega; por eso esto es un
# INTENTO y no una promesa, y si no conecta se dice con todas las letras en vez
# de morir con un error de Postgres que no explica nada.
#
# LA CONTRASEÑA SE ESCAPA. Puede llevar `@`, `:`, `/`, `#` o `?`, y cualquiera
# de esos caracteres sin escapar parte la URL por la mitad y produce un error
# que manda a mirar al sitio equivocado. Es el mismo aviso que ya da
# `docs/ENTORNO.md` sobre la cadena escrita a mano.
# ---------------------------------------------------------------------------

if [ -z "${DATABASE_URL:-}" ] \
  && [ -n "${SUPABASE_PROJECT_REF:-}" ] \
  && [ -n "${SUPABASE_DB_PASSWORD:-}" ]; then
  clave_escapada="$(
    SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" python3 -c \
      'import os,urllib.parse;print(urllib.parse.quote(os.environ["SUPABASE_DB_PASSWORD"],safe=""))'
  )"
  DATABASE_URL="postgresql://postgres:${clave_escapada}@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres"
  export DATABASE_URL
  echo "Sin DATABASE_URL: se arma la conexión directa con SUPABASE_PROJECT_REF y SUPABASE_DB_PASSWORD."
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo >&2 "Hace falta DATABASE_URL, o bien SUPABASE_PROJECT_REF y SUPABASE_DB_PASSWORD para armarla."
  exit 1
fi

# Se comprueba que la conexión va ANTES de contar migraciones, para que el
# mensaje sea «no se puede conectar» y no un fallo a mitad de un `psql`.
if ! error_conexion="$(psql "$DATABASE_URL" -q -c 'select 1' 2>&1)"; then
  echo >&2 "No se ha podido conectar con la base."
  echo >&2
  echo >&2 "$error_conexion"
  echo >&2

  # LA CONEXIÓN DIRECTA DE SUPABASE ES SÓLO IPv6, Y LOS RUNNERS DE GITHUB SON
  # IPv4. Pasó tal cual: el secreto estaba bien puesto, `db.<ref>.supabase.co`
  # resolvía a una dirección IPv6 y el runner contestaba «Network is
  # unreachable». Sin este aviso, el siguiente en verlo revisa la contraseña
  # tres veces antes de sospechar de la red.
  if printf '%s' "$error_conexion" | grep -qiE "network is unreachable|no route to host|cannot assign requested address"; then
    echo >&2 "ESTO ES LA RED, NO LAS CREDENCIALES."
    echo >&2
    echo >&2 "La conexión DIRECTA de Supabase (db.<ref>.supabase.co) se sirve sólo"
    echo >&2 "por IPv6, y un runner de GitHub sólo tiene IPv4. Hace falta la cadena"
    echo >&2 "del AGRUPADOR, que sí tiene IPv4:"
    echo >&2
    echo >&2 "  Supabase → Project Settings → Database → Connection string"
    echo >&2 "  → pestaña «Session pooler» (no «Direct connection»)"
    echo >&2
    echo >&2 "Tiene esta forma, con la región dentro del nombre:"
    echo >&2 "  postgresql://postgres.<ref>:<clave>@aws-0-<region>.pooler.supabase.com:5432/postgres"
  else
    echo >&2 "Revisa DATABASE_URL: Supabase → Project Settings → Database →"
    echo >&2 "Connection string. Si la contraseña lleva @ : / # o ?, hay que"
    echo >&2 "escaparla para URL."
  fi

  exit 1
fi

MAXIMO_PENDIENTES="${MAXIMO_PENDIENTES:-5}"
FORZAR="${FORZAR:-no}"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRACIONES="$RAIZ/supabase/migrations"

correr() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

# La tabla de control es de Supabase, pero una base levantada a mano no la
# tiene. Se crea con la única columna de la que este script depende; si ya
# existe con más columnas —que es lo que pasa en Supabase—, esto no la toca.
correr <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key
);
SQL

aplicadas="$(psql "$DATABASE_URL" -tAc \
  "select version from supabase_migrations.schema_migrations;")"

pendientes=()
for fichero in "$MIGRACIONES"/*.sql; do
  [ -e "$fichero" ] || continue
  nombre="$(basename "$fichero")"
  version="${nombre%%_*}"
  if printf '%s\n' "$aplicadas" | grep -qxF "$version"; then
    continue
  fi
  pendientes+=("$fichero")
done

if [ "${#pendientes[@]}" -eq 0 ]; then
  echo "La base ya está al día: no hay ninguna migración pendiente."
  exit 0
fi

echo "Pendientes (${#pendientes[@]}):"
for fichero in "${pendientes[@]}"; do
  echo "  · $(basename "$fichero")"
done

if [ "${#pendientes[@]}" -gt "$MAXIMO_PENDIENTES" ] && [ "$FORZAR" != "si" ]; then
  echo >&2
  echo >&2 "ABORTADO: hay ${#pendientes[@]} migraciones pendientes, más de las $MAXIMO_PENDIENTES"
  echo >&2 "que se consideran normales."
  echo >&2
  echo >&2 "Casi siempre esto significa que no se pudo leer la tabla de control y"
  echo >&2 "que en realidad ya están aplicadas: seguir adelante reharía el esquema"
  echo >&2 "entero sobre una base con datos. Compruébalo a mano antes de insistir."
  echo >&2
  echo >&2 "Si de verdad es una base nueva, repite con FORZAR=si."
  exit 1
fi

for fichero in "${pendientes[@]}"; do
  nombre="$(basename "$fichero")"
  version="${nombre%%_*}"
  echo "→ aplicando $(basename "$fichero")"
  correr -f "$fichero"
  correr -c "insert into supabase_migrations.schema_migrations (version)
             values ('$version') on conflict (version) do nothing;"
done

echo "Listo: ${#pendientes[@]} migración(es) aplicada(s)."
