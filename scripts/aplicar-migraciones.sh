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

: "${DATABASE_URL:?Hace falta DATABASE_URL con la cadena de conexión a la base}"

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

# UNA SOLA TRANSACCIÓN POR MIGRACIÓN, Y EL REGISTRO DENTRO. La cabecera decía
# que cada fichero traía su begin/commit, y la mitad no lo trae: una que
# fallara en la sentencia 5 dejaba las cuatro primeras aplicadas, sin registro,
# y al relanzar chocaba con «already exists». Y el insert de la versión iba en
# otra conexión: un corte entre las dos dejaba la migración aplicada y sin
# apuntar. Con `--single-transaction` y el insert en la misma invocación, o
# entra todo o no entra nada, como por el CLI.
for fichero in "${pendientes[@]}"; do
  nombre="$(basename "$fichero")"
  version="${nombre%%_*}"
  echo "→ aplicando $(basename "$fichero")"
  correr --single-transaction -f "$fichero" \
    -c "insert into supabase_migrations.schema_migrations (version)
        values ('$version') on conflict (version) do nothing;"
done

echo "Listo: ${#pendientes[@]} migración(es) aplicada(s)."
