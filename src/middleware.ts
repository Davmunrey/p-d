import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { PARAMETRO_VOLVER, RUTA_ACCESO, RUTA_PANEL } from "@/config/constants";
import { recordarInvitacion } from "@/lib/invitacion";

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
 *
 * Y DE PASO ANOTA LA INVITACIÓN. Quien abre su enlace `/rsvp/<token>` deja
 * aquí una cookie con él, y así la playlist de la portada sabe quién escribe.
 * Se hace en el middleware porque es el único sitio que ve esa navegación y
 * puede escribir cookies: una página no puede.
 */

/** Rutas que exigen sesión. El resto de la web es pública. */
function esDelPanel(ruta: string): boolean {
  return ruta === RUTA_PANEL || ruta.startsWith(`${RUTA_PANEL}/`);
}

export async function middleware(peticion: NextRequest) {
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
      : recordarInvitacion(peticion, respuesta);
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
  // por otra al renovar la sesión, y la cookie tiene que ir en la que se
  // devuelve. Anotarla en la primera era perderla justo al renovar.
  return recordarInvitacion(peticion, respuesta);
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

  const respuesta = NextResponse.redirect(destino);
  sinGuardarEnCache(respuesta);
  return respuesta;
}

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
