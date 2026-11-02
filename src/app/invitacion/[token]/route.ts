import { NextResponse, type NextRequest } from "next/server";

import { nombreDeInvitacion } from "@/lib/bbdd/invitacion";
import { COOKIE_INVITACION, opcionesCookieInvitacion } from "@/lib/invitacion";

/**
 * EL ENLACE PERSONAL: SE ANOTA Y SE VA A LA PORTADA
 *
 * El enlace de cada invitación no lleva a una página propia: hace que la web
 * sepa quién es. Se comprueba contra la base, se guarda en una cookie y se
 * salta a la portada, que saluda al grupo, le deja proponer canciones y, al
 * final, en vuestra estrella, le abre su formulario de confirmación.
 *
 * ES UNA RUTA Y NO UNA PÁGINA porque escribe una cookie, y una página no puede.
 *
 * QUÉ SE HACE CON CADA RESPUESTA DE LA BASE:
 *   · un nombre → se recuerda la invitación.
 *   · `null` → el enlace no vale (anulado al emitir otro, o mal copiado): se
 *     olvida la que hubiera y se va a la portada de todos. Sin pantalla de
 *     error: lo que hay detrás del enlace es la web, y la web funciona igual.
 *   · una avería o el cortafuegos → no se sabe, así que se recuerda igual. La
 *     base vuelve a comprobarlo al apuntar una canción, que es lo único que el
 *     token abre; tirarlo ahora dejaría sin playlist a quien sí tenía un enlace
 *     bueno el día que la base tardó en contestar.
 *
 * 303 Y NO 307: «mira esto otro», con GET. Y sin caché, ni en el navegador ni
 * en ningún intermedio: la respuesta lleva la cookie de una familia.
 */
export const dynamic = "force-dynamic";

export async function GET(
  peticion: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let valido: boolean | null;
  try {
    valido = (await nombreDeInvitacion(token)) !== null;
  } catch (error) {
    console.error("No se pudo comprobar un enlace de invitación:", error);
    valido = null;
  }

  const portada = peticion.nextUrl.clone();
  portada.pathname = "/";
  portada.search = "";

  const respuesta = NextResponse.redirect(portada, 303);
  if (valido === false) {
    respuesta.cookies.delete(COOKIE_INVITACION);
  } else {
    respuesta.cookies.set(
      COOKIE_INVITACION,
      token,
      opcionesCookieInvitacion(
        peticion.headers.get("x-forwarded-proto") ?? peticion.nextUrl.protocol,
      ),
    );
  }

  respuesta.headers.set("cache-control", "no-store");
  respuesta.headers.set("x-robots-tag", "noindex, nofollow");
  return respuesta;
}
