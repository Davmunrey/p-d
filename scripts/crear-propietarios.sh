#!/usr/bin/env bash
#
# Da de alta a los dos propietarios del panel.
#
# YO NO PUEDO HACER ESTO POR TI, y no es una excusa: el host de Supabase está
# bloqueado por la política de salida del contenedor donde corro. Este guion es
# para que lo lances tú desde tu portátil con una sola orden.
#
# Uso:
#
#   export NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
#   export SUPABASE_SERVICE_ROLE_KEY="<la clave service_role>"
#   export DATABASE_URL="<la conexión directa a la base>"
#   ./scripts/crear-propietarios.sh david@ejemplo.es paloma@ejemplo.es
#
# La clave `service_role` está en Supabase → Settings → API Keys. NO la pongas
# en Vercel ni en el repositorio: salta RLS entera, y aquí sólo se usa un
# momento desde tu máquina.
#
# LOS DOS ENTRAN POR LA LISTA (BODA-127). Antes el primero se nombraba con
# `designar_primer_propietario()` —que sólo sirve mientras no haya ninguno— y al
# segundo se le intentaba ascender con un `insert … on conflict do update`. Eso
# no funcionaba: el perfil ya existía (lo crea el trigger del alta), así que
# caía en el `update` y ahí `proteger_privilegios_perfil()` exige un propietario
# en `auth.uid()`, que en una sesión de `psql` es null. PRF01, y el segundo se
# quedaba fuera.
#
# Ahora los dos se escriben en `invitaciones_panel` y es la lista la que pone
# los perfiles al día, existan ya las cuentas o no. Un solo camino, y el mismo
# que usa `scripts/dar-acceso-al-panel.sh` para dar de alta a cualquier otro.

set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Uso: $0 <correo-primero> <correo-segundo>" >&2
  exit 1
fi

for v in NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY DATABASE_URL; do
  if [ -z "${!v:-}" ]; then echo "Falta $v" >&2; exit 1; fi
done

crear() {
  local correo="$1"
  # `email_confirm` para no tener que pasar por el correo de confirmación: es
  # una cuenta que estáis creando vosotros, no un registro público.
  curl -sS -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$correo\",\"email_confirm\":true}" |
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))'
}

# La lista va PRIMERO, y ya no por obligación sino por comodidad: así las
# cuentas nacen activas y no hace falta ni mirar sus identificadores. Si alguna
# de las dos ya existía, la lista la alcanza igual.
"$(dirname "$0")/dar-acceso-al-panel.sh" "$1" propietario
"$(dirname "$0")/dar-acceso-al-panel.sh" "$2" propietario

echo "Creando $1…" >&2
crear "$1" >/dev/null
echo "Creando $2…" >&2
crear "$2" >/dev/null

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
select p.correo_electronico, p.rol, p.activo
  from public.perfiles as p
 where p.correo_electronico in (lower('$1'), lower('$2'));"

echo >&2
echo "Listos. Ahora entrad en /acceso y usad «¿Habéis olvidado la contraseña?»" >&2
echo "para poneros una: las cuentas se han creado sin contraseña a propósito." >&2
