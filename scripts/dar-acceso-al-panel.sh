#!/usr/bin/env bash
#
# DAR ACCESO AL PANEL A UN CORREO
#
# Escribe una línea en `invitaciones_panel`, que es la lista de quién puede
# entrar. Desde BODA-127 esa lista manda siempre: si la cuenta aún no existe,
# nacerá con el rol que se le ponga aquí; si ya existe, se pone al día en el
# acto. Da igual el orden, que era justo lo que antes no daba igual.
#
# ES EL ARRANQUE DE UNA INSTALACIÓN, y por eso hace falta la conexión de
# administración o el editor SQL de Supabase: la tabla sólo la gestiona un
# `propietario`, y en una base recién desplegada todavía no hay ninguno.
#
# Uso:
#
#   ./scripts/dar-acceso-al-panel.sh david@ejemplo.es
#   ./scripts/dar-acceso-al-panel.sh planner@ejemplo.es lector
#
# Con `DATABASE_URL` puesta lo aplica. Sin ella imprime el SQL listo para pegar
# en Supabase → SQL Editor, que es de donde se hace esto la primera vez.
#
# DESPUÉS HAY QUE CREAR LA CUENTA, si no existe ya: Supabase → Authentication →
# Users → «Add user» → Create new user, con «Auto Confirm User» marcado. O bien
# entrar en /acceso y usar «He olvidado la contraseña», que también sirve para
# ponerse la primera.

set -euo pipefail

CORREO="${1:-}"
ROL="${2:-propietario}"

if [ -z "$CORREO" ]; then
  echo >&2 "Uso: $0 <correo> [propietario|editor|lector]"
  exit 1
fi

case "$ROL" in
  propietario | editor | lector) ;;
  *)
    echo >&2 "Rol desconocido: «$ROL». Los que hay son propietario, editor y lector."
    exit 1
    ;;
esac

# El correo acaba dentro de un literal SQL. En vez de escaparlo se exige que sea
# un correo de verdad: así no hay comilla, punto y coma ni guion doble que
# colar, y de paso se cazan las erratas antes de tocar la base.
if ! printf '%s' "$CORREO" | grep -qE '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'; then
  echo >&2 "Eso no parece un correo: «$CORREO»."
  exit 1
fi

# `lower(btrim(...))` aquí además de en el trigger que normaliza: la consulta de
# comprobación de abajo compara contra la fila ya guardada, y sin normalizar
# buscaría «David@…» donde está escrito «david@…».
SQL=$(
  cat <<SQL
insert into public.invitaciones_panel (correo_electronico, rol)
values (lower(btrim('$CORREO')), '$ROL')
on conflict (correo_electronico) do update set rol = excluded.rol;

select
  i.correo_electronico            as correo,
  i.rol                           as rol_concedido,
  (u.id is not null)              as tiene_cuenta,
  coalesce(p.activo, false)       as perfil_activo,
  p.rol                           as rol_del_perfil
from public.invitaciones_panel as i
left join auth.users     as u on lower(btrim(u.email)) = i.correo_electronico
left join public.perfiles as p on p.usuario_id = u.id
where i.correo_electronico = lower(btrim('$CORREO'));
SQL
)

if [ -z "${DATABASE_URL:-}" ]; then
  cat >&2 <<AVISO
No hay DATABASE_URL, así que esto no se aplica solo.

Copia lo de abajo y pégalo en Supabase → SQL Editor. La última consulta te dice
cómo quedó: si «tiene_cuenta» sale falso, crea la cuenta con ese mismo correo y
el alta se hará sola.

AVISO
  printf '%s\n' "$SQL"
  exit 0
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
$SQL
SQL
