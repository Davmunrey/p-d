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
# EL PRIMERO SE CONVIERTE EN PROPIETARIO Y EL SEGUNDO TAMBIÉN.
# `designar_primer_propietario()` sólo funciona mientras no haya ninguno —es el
# arranque en frío—, así que al segundo lo asciende el primero, que para
# entonces ya tiene permiso.

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

echo "Creando $1…" >&2
PRIMERO="$(crear "$1")"
echo "Creando $2…" >&2
SEGUNDO="$(crear "$2")"

if [ -z "$PRIMERO" ] || [ -z "$SEGUNDO" ]; then
  echo "Alguna cuenta no se creó. Si ya existían, coge sus id en" >&2
  echo "Supabase → Authentication → Users y sáltate este paso." >&2
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
select public.designar_primer_propietario('$PRIMERO', 'David Muñoz');

-- El segundo entra ya con el primero dentro, así que se le asciende a mano.
-- El trigger que protege los privilegios lo permite porque quien escribe es
-- un propietario: es exactamente el camino que seguiría desde el panel.
insert into public.perfiles (usuario_id, nombre_completo, rol, activo)
values ('$SEGUNDO', 'Paloma Gamboa', 'propietario', true)
on conflict (usuario_id) do update set rol = 'propietario', activo = true;
SQL

echo >&2
echo "Listos. Ahora entrad en /acceso y usad «¿Habéis olvidado la contraseña?»" >&2
echo "para poneros una: las cuentas se han creado sin contraseña a propósito." >&2
