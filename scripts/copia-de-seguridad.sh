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

# PRIMERO, QUÉ VERSIÓN ES LA BASE. Un `pg_dump` más viejo que el servidor se
# niega a volcarlo («server version mismatch»), y el que se tenía a mano era
# el más alto instalado, sin mirar nada más: en el runner de GitHub, el 16,
# contra una base de producción que es PostgreSQL 17. La copia no se habría
# hecho nunca, ni con todos los secretos bien puestos. Para preguntar vale
# cualquier `psql`; para volcar, el de la versión del servidor.
BIN_ALTO="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$BIN_ALTO" ] && export PATH="$BIN_ALTO:$PATH"

VERSION_SERVIDOR="$(psql "$DATABASE_URL" -XAtqc 'show server_version_num')"
MAYOR_SERVIDOR=$((VERSION_SERVIDOR / 10000))

if [ -x "/usr/lib/postgresql/$MAYOR_SERVIDOR/bin/pg_dump" ]; then
  export PATH="/usr/lib/postgresql/$MAYOR_SERVIDOR/bin:$PATH"
fi

if ! command -v pg_dump >/dev/null; then
  echo "No hay pg_dump. Instala postgresql-client-$MAYOR_SERVIDOR." >&2
  exit 1
fi

MAYOR_PG_DUMP="$(pg_dump --version | sed -E 's/^[^0-9]*([0-9]+).*/\1/')"
if [ "$MAYOR_PG_DUMP" -lt "$MAYOR_SERVIDOR" ]; then
  echo "La base es PostgreSQL $MAYOR_SERVIDOR y este pg_dump es el $MAYOR_PG_DUMP: no puede volcarla." >&2
  echo "Instala postgresql-client-$MAYOR_SERVIDOR (repositorio apt.postgresql.org)." >&2
  exit 1
fi

mkdir -p "$DESTINO"

# La fecha va en el nombre y en UTC: un fichero por día, ordenable por nombre,
# y sin depender de la zona horaria de quien lo ejecute.
FECHA="$(date -u +%Y-%m-%d)"
FICHERO="$DESTINO/boda-$FECHA.dump"

# `--no-owner`, y NADA MÁS: los permisos van dentro. Antes también iba
# `--no-privileges`, con la idea de que los roles de Supabase no existirían
# donde se restaurase. En un Supabase sí existen —`anon`, `authenticated` y
# `service_role` están en todos—, y el modelo de acceso de esta base está hecho
# de GRANT explícitos: se revoca todo y se concede tabla a tabla. Sin ellos, la
# base restaurada tenía sus filas y sus políticas, pero la portada no podía leer
# `configuracion_boda`, el RSVP no podía llamar a `obtener_invitacion` y el
# panel no veía nada. Las POLÍTICAS RLS van dentro igual —son esquema—.
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
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
