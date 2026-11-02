import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  PARAMETRO_VOLVER,
  PATRON_TOKEN_INVITACION,
  RUTA_ACCESO,
  RUTA_INVITACION,
  RUTA_OLVIDAR_INVITACION,
  RUTA_PANEL,
  URL_TESELAS_MAPA,
  URL_WHATSAPP,
} from "@/config/constants";
import { construirCsp } from "@/lib/csp";
import { COOKIE_INVITACION, opcionesCookieInvitacion } from "@/lib/invitacion";

/**
 * BODA-41 · LA PUERTA, ANTES DE PINTAR NADA
 *
 * ESTO NO SUSTITUYE A RLS. Lo que de verdad protege los datos son las
 * políticas de la base: aunque este fichero desapareciera, nadie leería un
 * teléfono ni un presupuesto. Esto es la segunda capa, y su trabajo es otro —
 * que una pantalla del panel no llegue a existir para quien no ha entrado.
 * Sin ella, la página se pinta, se va a por los datos, vuelve vacía y el
 * resultado es un panel fantasma: enseña la estructura, desconcierta, y parece
 * un fallo cuando es lo contrario.
 *
 * ADEMÁS, RENUEVA LA SESIÓN. El token de acceso caduca en una hora. Quien
 * refresca ese token es `getUser()`, y solo desde aquí se pueden escribir las
 * cookies nuevas: un Server Component no puede. Sin este fichero, entrar a las
 * nueve y seguir a las once significaba encontrarse fuera sin haber tocado
 * nada.
 *
 * PARA COMPROBAR EL PERFIL, NO. Aquí solo se pregunta si hay sesión. Si
 * además está activo lo decide `accesoActual()` en cada página, que ya lee
 * `perfiles`. Repetirlo aquí costaría una consulta más en cada navegación y,
 * peor, abriría un bucle: quien tuviera sesión y el perfil desactivado iría de
 * la puerta al panel y del panel a la puerta sin parar.
 */

/** Rutas que exigen sesión. El resto de la web es pública. */
function esDelPanel(ruta: string): boolean {
  return ruta === RUTA_PANEL || ruta.startsWith(`${RUTA_PANEL}/`);
}

/**
 * LA CSP VA EN LA PETICIÓN Y EN LA RESPUESTA. En la petición porque Next lee
 * de ahí el nonce y lo pone en cada `<script>` que emite —sin eso, la primera
 * página bloquearía su propio arranque—; en la respuesta porque es donde el
 * navegador la aplica. El nonce es nuevo en cada petición: es lo que hace que
 * un script inyectado no pueda adivinarlo.
 */
function conCsp(peticion: NextRequest): string {
  const nonce = btoa(crypto.randomUUID());
  const csp = construirCsp(nonce, {
    supabase: process.env.NEXT_PUBLIC_SUPABASE_URL,
    mapa: URL_TESELAS_MAPA,
    whatsapp: URL_WHATSAPP,
    desarrollo: process.env.NODE_ENV !== "production",
  });
  peticion.headers.set("x-nonce", nonce);
  peticion.headers.set("content-security-policy", csp);
  return csp;
}

export async function middleware(peticion: NextRequest) {
  const enlace = tokenDelEnlace(peticion.nextUrl.pathname);
  if (enlace !== undefined) return recordarEnlace(peticion, enlace);
  if (peticion.nextUrl.pathname === RUTA_OLVIDAR_INVITACION) return olvidarEnlace();

  const csp = conCsp(peticion);

  // La respuesta se crea antes de preguntar por el usuario: `setAll` escribe
  // en ella las cookies renovadas mientras `getUser()` está en marcha.
  let respuesta = NextResponse.next({ request: peticion });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sin configuración no hay sesión posible, así que al panel no entra nadie.
  // Cerrado y no abierto: una variable que falta no puede acabar en una puerta
  // franca.
  if (!url || !clave) {
    return esDelPanel(peticion.nextUrl.pathname)
      ? aLaPuerta(peticion)
      : conCabeceraCsp(respuesta, csp);
  }

  const supabase = createServerClient(url, clave, {
    cookies: {
      getAll() {
        return peticion.cookies.getAll();
      },
      setAll(nuevas) {
        for (const { name, value } of nuevas) {
          peticion.cookies.set(name, value);
        }
        respuesta = NextResponse.next({ request: peticion });
        for (const { name, value, options } of nuevas) {
          respuesta.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getUser()` y no `getSession()`: el primero valida el token contra el
  // servidor de Auth, el segundo se fía de la cookie. Para decidir si alguien
  // entra, fiarse de la cookie es fiarse de quien la manda.
  const {
    data: { user: usuario },
  } = await supabase.auth.getUser();

  if (!usuario && esDelPanel(peticion.nextUrl.pathname)) return aLaPuerta(peticion);

  if (esDelPanel(peticion.nextUrl.pathname)) sinGuardarEnCache(respuesta);

  // Al final y no antes: `setAll` puede haber sustituido la respuesta entera
  // por otra al renovar la sesión, y la CSP tiene que ir en la que sale.
  return conCabeceraCsp(respuesta, csp);
}

/**
 * EL ENLACE PERSONAL: SE ANOTA Y SE VA A LA PORTADA, AQUÍ MISMO
 *
 * El enlace de cada invitación no lleva a una página propia: hace que la web
 * sepa quién es. Se guarda en una cookie y se salta a la portada, que saluda al
 * grupo y, en vuestra estrella, le abre su formulario.
 *
 * AQUÍ Y NO EN UNA RUTA. Era una ruta que preguntaba a la base antes de
 * redirigir, y en producción eso costaba arrancar una función entera sólo para
 * el salto: 2,4 s en frío, y después otro arranque para la portada. Quien abre
 * el enlace desde el WhatsApp pagaba los dos. Aquí no hay arranque, y la
 * pregunta a la base la hace la portada, que ya la hacía para saludar: si el
 * enlace no vale, no saluda a nadie y lo olvida (`OlvidarEnlace`).
 *
 * LO QUE NI SIQUIERA PARECE UN TOKEN no se anota: se olvida lo que hubiera y
 * no llega a preguntarse a la base, que contaría un intento más.
 *
 * 303 Y NO 307: «mira esto otro», con GET. Y sin caché, ni en el navegador ni
 * en ningún intermedio: la respuesta lleva la cookie de una familia.
 */
function recordarEnlace(peticion: NextRequest, token: string | null): NextResponse {
  const portada = peticion.nextUrl.clone();
  portada.pathname = "/";
  portada.search = "";

  const respuesta = NextResponse.redirect(portada, REDIRECCION_A_OTRA);
  if (token) {
    respuesta.cookies.set(
      COOKIE_INVITACION,
      token,
      opcionesCookieInvitacion(
        peticion.headers.get("x-forwarded-proto") ?? peticion.nextUrl.protocol,
      ),
    );
  } else {
    respuesta.cookies.delete(COOKIE_INVITACION);
  }
  respuesta.headers.set("Cache-Control", "no-store");
  respuesta.headers.set("X-Robots-Tag", "noindex, nofollow");
  return respuesta;
}

/**
 * OLVIDA LA INVITACIÓN RECORDADA. La portada lo pide como una imagen cuando la
 * base le ha dicho que el enlace de la cookie no vale —mal tecleado, o anulado
 * al emitir otro—: una página no puede borrar una cookie, y una imagen se pide
 * también sin JavaScript. Sólo borra la cookie de quien lo pide; desde otra web
 * no llega, porque una cookie `lax` no se escribe desde un recurso de otro
 * sitio. `204`: no hay nada que pintar.
 */
function olvidarEnlace(): NextResponse {
  const respuesta = new NextResponse(null, { status: SIN_CONTENIDO });
  respuesta.cookies.delete(COOKIE_INVITACION);
  respuesta.headers.set("Cache-Control", "no-store");
  respuesta.headers.set("X-Robots-Tag", "noindex, nofollow");
  return respuesta;
}

/**
 * El token de `/invitacion/<token>`: `undefined` si la ruta no es un enlace,
 * `null` si lo es pero lo que trae no tiene forma de token.
 */
function tokenDelEnlace(ruta: string): string | null | undefined {
  const prefijo = `${RUTA_INVITACION}/`;
  if (!ruta.startsWith(prefijo)) return undefined;
  const tramo = ruta.slice(prefijo.length);
  if (tramo.includes("/")) return undefined;

  let token: string;
  try {
    token = decodeURIComponent(tramo).trim();
  } catch {
    return null;
  }
  return PATRON_TOKEN_INVITACION.test(token) ? token : null;
}

function conCabeceraCsp(respuesta: NextResponse, csp: string): NextResponse {
  respuesta.headers.set("Content-Security-Policy", csp);
  return respuesta;
}

/**
 * Que el panel no se quede guardado en el navegador.
 *
 * Sin esto, cerrar sesión y darle a «atrás» devuelve la pantalla anterior tal
 * cual: el navegador la tiene en su caché de historial y no vuelve a pedirla,
 * así que ni el middleware ni RLS llegan a enterarse. Los datos que se ven son
 * viejos y ya no se pueden refrescar, pero están ahí — en un portátil
 * compartido, eso es la lista de invitados a la vista de quien lo coja después.
 *
 * `no-store` obliga a pedirla otra vez, y esa petición sí pasa por aquí.
 */
function sinGuardarEnCache(respuesta: NextResponse): void {
  respuesta.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
}

/**
 * Devuelve a la puerta anotando a dónde quería ir.
 *
 * Sin esto, quien abre un enlace directo a una pantalla concreta —de un
 * mensaje, de un marcador— entra y aparece en la portada del panel, teniendo
 * que buscar otra vez lo que ya había pedido.
 */
function aLaPuerta(peticion: NextRequest): NextResponse {
  const destino = peticion.nextUrl.clone();
  destino.pathname = RUTA_ACCESO;
  destino.search = "";
  destino.searchParams.set(
    PARAMETRO_VOLVER,
    `${peticion.nextUrl.pathname}${peticion.nextUrl.search}`,
  );

  /*
    UNA ACCIÓN DEL PANEL NO SIGUE UN 307. Si la sesión se cerró en otro
    dispositivo —`signOut()` es global: cerrar en el móvil cierra también el
    portátil—, el siguiente «Guardar» llega aquí sin usuario. Con un 307, el
    `fetch` de la acción lo seguía con el mismo POST hasta la puerta, recibía
    HTML en vez del formato de una acción, y el cliente de Next lo convertía en
    «An unexpected response was received from the server»: la pantalla de error
    del panel, en inglés, en vez de la puerta. Lo que el cliente sí entiende es
    la cabecera con la que las propias acciones redirigen, y con ella hace una
    navegación completa a la puerta, que recuerda a dónde se volvía.
  */
  if (peticion.headers.has(CABECERA_ACCION)) {
    const respuesta = new NextResponse(null, {
      headers: {
        [CABECERA_REDIRECCION_ACCION]: `${destino.pathname}${destino.search};replace`,
      },
    });
    sinGuardarEnCache(respuesta);
    return respuesta;
  }

  /*
    Y UN FORMULARIO SIN JAVASCRIPT TAMPOCO REPITE SU POST. El 307 conserva el
    método: el navegador volvía a mandar el formulario —datos incluidos— a la
    puerta. El 303 dice «ve a mirar esto otro», con un GET. Las visitas normales
    siguen con el 307 de siempre.
  */
  const esLectura = peticion.method === "GET" || peticion.method === "HEAD";
  const respuesta = NextResponse.redirect(
    destino,
    esLectura ? REDIRECCION_TEMPORAL : REDIRECCION_A_OTRA,
  );
  sinGuardarEnCache(respuesta);
  return respuesta;
}

/** La cabecera con la que el cliente de Next marca una acción de servidor. */
const CABECERA_ACCION = "next-action";
/** Y la que entiende como «esta acción redirige a…» (ver server-action-reducer). */
const CABECERA_REDIRECCION_ACCION = "x-action-redirect";
/** 307: «la misma petición, en otra dirección». La de siempre para visitas. */
const REDIRECCION_TEMPORAL = 307;
/** 303: «mira esto otro», con GET, sea cual sea el método original. */
const REDIRECCION_A_OTRA = 303;
/** 204: hecho, y no hay nada que devolver. */
const SIN_CONTENIDO = 204;

export const config = {
  /**
   * Se excluyen los ficheros estáticos y las imágenes: no tienen sesión que
   * renovar y pasar por aquí solo les añadiría latencia. Todo lo demás sí
   * pasa, porque la renovación de la sesión tiene que ocurrir navegue por
   * donde navegue quien ha entrado, no solo dentro del panel.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
