#!/usr/bin/env bash
#
# Prepara los dos usuarios con los que se prueba el acceso al panel contra el
# Supabase local. Solo se usa en CI (y en un portátil con `supabase start`):
# los usuarios de verdad se crean desde el panel de Supabase.
#
# POR QUÉ NO SE INSERTA EN `auth.users` A MANO
#
# Se intentó y no funcionó: los usuarios quedaban impecables en la tabla y aun
# así no podían identificarse con su contraseña. Un `insert` a mano solo
# rellena las columnas que uno conoce, y `auth.users` tiene una docena más que
# son de GoTrue —`confirmation_token`, `email_change`,
# `reauthentication_token`…—, cambian con cada versión y no están documentadas
# porque no son para nosotros.
#
# La API de administración sí es pública y estable. Los usuarios se crean por
# ahí y aquí solo se escribe lo nuestro: `perfiles`.
#
# QUÉ COMPRUEBA ANTES DE TERMINAR
#
# Que el usuario con acceso puede identificarse de verdad contra GoTrue. Sin
# esa comprobación, un fallo de preparación llega disfrazado de fallo de la
# aplicación: el test dice «no entró al panel» y se pierde media tarde mirando
# el código de la puerta, que estaba bien.

set -euo pipefail

CORREO_CON_ACCESO="${CORREO_CON_ACCESO:-con-acceso@ejemplo.test}"
CORREO_SIN_ACCESO="${CORREO_SIN_ACCESO:-sin-acceso@ejemplo.test}"
CONTRASENA_PRUEBAS="${CONTRASENA_PRUEBAS:-contrasena-larga-de-pruebas}"

# Los datos de conexión los da la propia CLI: así el script no repite puertos
# ni claves que ya están en otro sitio.
estado="$(supabase status -o env)"
valor() { printf '%s\n' "$estado" | grep "^$1=" | cut -d= -f2- | tr -d '"'; }

API_URL="$(valor API_URL)"
SERVICE_ROLE_KEY="$(valor SERVICE_ROLE_KEY)"
DB_URL="$(valor DB_URL)"

if [ -z "$API_URL" ] || [ -z "$SERVICE_ROLE_KEY" ] || [ -z "$DB_URL" ]; then
  echo "No hay un Supabase local levantado: ejecuta 'supabase start' primero." >&2
  exit 1
fi

# --- 1. Los usuarios, por la puerta buena ------------------------------------

crear_usuario() {
  local correo="$1"
  local respuesta

  respuesta="$(curl -sS -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    --data "$(jq -nc \
      --arg correo "$correo" \
      --arg contrasena "$CONTRASENA_PRUEBAS" \
      '{email: $correo, password: $contrasena, email_confirm: true}')")"

  local id
  id="$(printf '%s' "$respuesta" | jq -r '.id // empty')"

  if [ -z "$id" ]; then
    echo "No se pudo crear $correo: $respuesta" >&2
    exit 1
  fi

  printf '%s' "$id"
}

ID_CON_ACCESO="$(crear_usuario "$CORREO_CON_ACCESO")"
ID_SIN_ACCESO="$(crear_usuario "$CORREO_SIN_ACCESO")"

# --- 2. Los perfiles, que son lo nuestro -------------------------------------

psql "$DB_URL" \
  -v ON_ERROR_STOP=1 \
  -v id_con_acceso="$ID_CON_ACCESO" \
  -v id_sin_acceso="$ID_SIN_ACCESO" \
  -f "$(dirname "$0")/preparar-acceso-pruebas.sql"

# --- 3. Comprobar que la preparación sirve para algo -------------------------

respuesta="$(curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data "$(jq -nc \
    --arg correo "$CORREO_CON_ACCESO" \
    --arg contrasena "$CONTRASENA_PRUEBAS" \
    '{email: $correo, password: $contrasena}')")"

if [ -z "$(printf '%s' "$respuesta" | jq -r '.access_token // empty')" ]; then
  echo "El usuario con acceso no puede identificarse contra GoTrue: $respuesta" >&2
  exit 1
fi

echo "Listos: $CORREO_CON_ACCESO (activo) y $CORREO_SIN_ACCESO (desactivado)."
