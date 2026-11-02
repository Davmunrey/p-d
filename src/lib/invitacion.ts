import { DIAS_RECUERDO_INVITACION } from "@/config/constants";

/**
 * BODA-27 · EL NAVEGADOR SE ACUERDA DE QUÉ INVITACIÓN ES
 *
 * La playlist de la portada deja apuntar canciones, y `sugerir_cancion()` en
 * la base exige un token de invitación válido: la lista que sonará esa noche es
 * de los invitados, no de quien pase por la web. Y la portada saluda al grupo
 * por su nombre. Pero la portada no lleva token en la URL — el token vive en
 * el enlace personal, `/invitacion/<token>`.
 *
 * ASÍ QUE SE GUARDA AL ABRIR EL ENLACE, en una cookie que sólo lee el servidor,
 * y el enlace lleva a la portada. Así además el token desaparece de la barra
 * de direcciones: quien copia la dirección para pasársela a su hermano le pasa
 * la web, no su invitación.
 *
 * ESTE FICHERO NO TOCA `next/headers` ni `server-only` para poder usarlo desde
 * una ruta y desde los tests. Leer la cookie desde una página es lo que hace
 * `invitacion-recordada.ts`, que es su pareja.
 */

/**
 * `boda:` delante: en un navegador con veinte pestañas abiertas, un nombre de
 * cookie sin prefijo es un nombre que alguien más va a usar.
 */
export const COOKIE_INVITACION = "boda:invitacion";

/**
 * Cómo se guarda la cookie.
 *
 * `secure` SEGÚN EL PROTOCOLO REAL y no según `NODE_ENV`: una compilación de
 * producción servida por `http` —los tests E2E— marcaba la cookie como segura
 * y Safari la tiraba sin decir nada. Quien llama pasa primero la cabecera que
 * pone el proxy: detrás de Vercel, la petición ya no conserva el `https` con
 * el que entró.
 */
export function opcionesCookieInvitacion(protocolo: string | null) {
  return {
    // El navegador no necesita leerla: sólo se usa en el servidor.
    httpOnly: true,
    sameSite: "lax",
    secure: (protocolo ?? "").startsWith("https"),
    // Toda la web: quien la lee es la portada.
    path: "/",
    maxAge: DIAS_RECUERDO_INVITACION * 24 * 60 * 60,
  } as const;
}
