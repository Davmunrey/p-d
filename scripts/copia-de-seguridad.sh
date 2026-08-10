#!/usr/bin/env bash
#
# BODA-94 · La copia de seguridad
#
# La lista de invitados con sus alergias y sus teléfonos no se puede volver a
# pedir: son doscientas conversaciones. El plan gratuito de Supabase no guarda
# copias por ti, así que si alguien borra una tabla sin querer, no hay a dónde
# volver.
#
# EL VOLCADO ES DE ESQUEMA **Y** DATOS, y ahí está la diferencia entre una copia
# y una copia que sirve. Un volcado de sólo datos restaura los invitados en una
# base sin políticas RLS: la lista estaría ahí, y también a la vista de
# cualquiera. Lo que hay que poder reconstruir es la base entera, protecciones
# incluidas.
#
# EN FORMATO PERSONALIZADO (`-Fc`) y no en SQL plano: `pg_restore` puede
# entonces restaurar tabla a tabla, que es lo que hace falta cuando lo que se
# perdió fue una sola. Con un `.sql` la única opción es todo o nada.
#
# Se imprime por la salida estándar la ruta del fichero, para poder hacer:
#
#     FICHERO="$(./scripts/copia-de-seguridad.sh)"

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Falta DATABASE_URL: no hay base que copiar." >&2
  exit 1
fi

DESTINO="${DIRECTORIO_COPIAS:-copias}"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$BIN" ] && export PATH="$BIN:$PATH"

mkdir -p "$DESTINO"

# La fecha va en el nombre y en UTC: un fichero por día, ordenable por nombre,
# y sin depender de la zona horaria de quien lo ejecute.
FECHA="$(date -u +%Y-%m-%d)"
FICHERO="$DESTINO/boda-$FECHA.dump"

# `--no-owner` y `--no-privileges`: los roles de Supabase no existen en la base
# donde se restaure, y sin esto `pg_restore` se llena de errores por cada
# `alter owner` que no puede aplicar. Las POLÍTICAS RLS sí van dentro —son
# parte del esquema— que es lo que de verdad hay que recuperar.
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --schema=public \
  --file="$FICHERO" >&2

# Un volcado vacío es el fallo silencioso de este guion: el comando sale con
# cero, el fichero existe, y dentro no hay nada. Se comprueba que pesa algo
# antes de dar la copia por buena.
TAMANO="$(wc -c <"$FICHERO")"
if [ "$TAMANO" -lt 1024 ]; then
  echo "La copia pesa $TAMANO bytes: eso no es una base de datos." >&2
  exit 1
fi

echo "$FICHERO"
