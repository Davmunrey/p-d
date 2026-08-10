import type { NextRequest, NextResponse } from "next/server";

import { DIAS_RECUERDO_INVITACION, RUTA_RSVP } from "@/config/constants";

/**
 * BODA-27 · EL NAVEGADOR SE ACUERDA DE QUÉ INVITACIÓN ES
 *
 * La playlist de la portada deja apuntar canciones, y `sugerir_cancion()` en
 * la base exige un token de invitación válido. Eso está bien puesto: la lista
 * que sonará esa noche es de los ciento veinte invitados, no de quien pase por
 * la web. Pero en la portada no hay token en la URL — el token vive en
 * `/rsvp/<token>`, que es otra página.
 *
 * ASÍ QUE SE GUARDA AL ABRIR LA INVITACIÓN. Quien entra por su enlace deja una
 * cookie con él, y a partir de ahí la portada sabe quién escribe. Quien llega a
 * la web sin haber abierto nunca su invitación no ve el campo: ve una línea que
 * explica que hace falta el enlace. Nada de un formulario que sólo sirve para
 * dar un error.
 *
 * NO SE COMPRUEBA AQUÍ QUE EL TOKEN VALGA, y no es un descuido. Comprobarlo
 * significaría una consulta a la base en cada navegación de toda la web,
 * incluida la portada, para un dato que la base vuelve a comprobar cuando de
 * verdad importa: al escribir. Un token inventado guardado en esta cookie no
 * abre nada — `sugerir_cancion()` lo rechaza y además apunta el intento fallido
 * en el mismo cortafuegos que protege el RSVP.
 *
 * ESTE FICHERO LO IMPORTA EL MIDDLEWARE, así que no puede tocar
 * `next/headers` ni `server-only`: allí no existen. Leer la cookie desde una
 * página es lo que hace `invitacion-recordada.ts`, que es su pareja.
 */

/**
 * `boda:` delante, como el borrador del RSVP: en un navegador con veinte
 * pestañas abiertas, un nombre de cookie sin prefijo es un nombre que alguien
 * más va a usar.
 */
export const COOKIE_INVITACION = "boda:invitacion";

/**
 * El token de un `/rsvp/<token>`, o `null` si la ruta es otra.
 *
 * Se exige que sea EXACTAMENTE un segmento debajo del RSVP. `/rsvp` a secas no
 * lleva token, y cualquier cosa más profunda tampoco es una invitación: dar por
 * bueno el primer trozo convertiría una ruta futura en un token falso que se
 * guardaría encima del bueno.
 */
export function tokenDeInvitacionEnRuta(ruta: string): string | null {
  if (!ruta.startsWith(`${RUTA_RSVP}/`)) return null;

  const resto = ruta.slice(RUTA_RSVP.length + 1);
  if (!resto || resto.includes("/")) return null;

  // La ruta viene codificada; el token que espera la base es el de verdad.
  try {
    return decodeURIComponent(resto);
  } catch {
    return null;
  }
}

/**
 * Anota la invitación en la respuesta si la petición era la de un enlace.
 *
 * Devuelve la misma respuesta para poder encadenarla en el `return` del
 * middleware, que es donde se sabe cuál es la definitiva.
 */
export function recordarInvitacion(
  peticion: NextRequest,
  respuesta: NextResponse,
): NextResponse {
  const token = tokenDeInvitacionEnRuta(peticion.nextUrl.pathname);
  if (!token) return respuesta;

  respuesta.cookies.set(COOKIE_INVITACION, token, {
    // El navegador no necesita leerlo: sólo se usa en el servidor.
    httpOnly: true,
    sameSite: "lax",
    /*
      `Secure` según el protocolo real y no según `NODE_ENV`, por la misma
      razón que el borrador del RSVP: una compilación de producción servida por
      `http` —los tests E2E— marcaba la cookie como segura y Safari la tiraba
      sin decir nada.

      Se mira primero la cabecera que pone el proxy: detrás de Vercel, la
      petición que llega al middleware ya no conserva el `https` con el que
      entró.
    */
    secure: (peticion.headers.get("x-forwarded-proto") ?? peticion.nextUrl.protocol).startsWith(
      "https",
    ),
    // Toda la web, no sólo el RSVP: quien la va a leer es la portada.
    path: "/",
    maxAge: DIAS_RECUERDO_INVITACION * 24 * 60 * 60,
  });

  return respuesta;
}
