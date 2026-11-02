import "server-only";

import { cookies, headers } from "next/headers";

import { MINUTOS_BORRADOR_RSVP, TROZO_COOKIE_BYTES } from "@/config/constants";
import {
  codificar,
  decodificar,
  nombreDelTrozo,
  trocear,
  trozosSobrantes,
  unirTrozos,
} from "@/lib/cookie-troceada";

/**
 * EL BORRADOR DE LA CONFIRMACIÓN
 *
 * El formulario tiene dos pasos y funciona sin una línea de JavaScript, así
 * que entre paso y paso hay un `POST` y una redirección. Lo que se ha escrito
 * tiene que sobrevivir a eso, y hay tres formas de conseguirlo:
 *
 *  - **Campos ocultos.** Se pierden con el botón «atrás» del navegador y
 *    obligan a repintar todo el estado en cada paso.
 *  - **La URL.** Un campo de alergias largo la revienta, y deja la respuesta de
 *    alguien escrita en el historial del móvil que le han prestado.
 *  - **Una cookie.** Sobrevive a la redirección, al «atrás» y hasta a cerrar la
 *    pestaña sin querer, que es exactamente el accidente que este formulario no
 *    se puede permitir.
 *
 * Se elige la cookie. Es `httpOnly` —nada de esto lo necesita el navegador— y
 * caduca sola: es un borrador, no una sesión.
 *
 * LLEVA EL TOKEN DENTRO. Sin eso, abrir un segundo enlace de invitación en el
 * mismo móvil —cosa que pasa: una madre abre el suyo y el de su hija— heredaría
 * las respuestas del primero. Al no coincidir el token, el borrador se
 * descarta y se empieza limpio.
 *
 * Y VA EN VARIAS COOKIES SI NO CABE EN UNA. Los navegadores tiran una cookie
 * de más de 4096 bytes sin decir nada, y cuatro personas con menú, alergias y
 * autobús, con tildes, pueden pasar de ahí una vez codificadas.
 * `cookie-troceada.ts` parte y une; aquí sólo se ponen el nombre y los
 * atributos.
 */
export interface Borrador {
  token: string;
  asistencia: Record<string, "confirmado" | "rechazado">;
  menu: Record<string, string>;
  alergias: Record<string, string>;
  autobus: Record<string, boolean>;
  /**
   * Si ya se le han puesto las respuestas guardadas en la base. Se siembra una
   * vez: después manda lo que se va escribiendo, aunque contradiga a la base.
   */
  sembrado?: boolean;
}

const NOMBRE_COOKIE = "boda:rsvp";

/** La landing, que es donde está el formulario y adonde vuelve cada paso. */
const RUTA_COOKIE = "/";

export function borradorVacio(token: string): Borrador {
  return { token, asistencia: {}, menu: {}, alergias: {}, autobus: {} };
}

/**
 * Lee el borrador del token dado. Devuelve uno vacío si no hay, si está roto o
 * si es de otro enlace: en ningún caso lanza. Perder un borrador es molesto;
 * romper la landing por una cookie mal formada es mucho peor.
 */
export async function leerBorrador(token: string): Promise<Borrador> {
  const tarro = await cookies();
  const bruto = unirTrozos((nombre) => tarro.get(nombre)?.value, NOMBRE_COOKIE);
  if (!bruto) return borradorVacio(token);

  const guardado = decodificar(bruto) as Partial<Borrador> | null;
  if (!guardado || guardado.token !== token) return borradorVacio(token);

  return { ...borradorVacio(token), ...guardado, token };
}

/**
 * `Secure` sí, pero según cómo se esté sirviendo la página y no según
 * `NODE_ENV`: con una compilación de producción servida por `http` —que es
 * como corren los tests—, Safari descarta en silencio una cookie `Secure`, y
 * el formulario se quedaba clavado en el primer paso. Detrás de Vercel llega
 * `https` y la cookie va protegida.
 */
async function servidoPorHttps(): Promise<boolean> {
  return (await headers()).get("x-forwarded-proto") === "https";
}

export async function guardarBorrador(borrador: Borrador): Promise<void> {
  const tarro = await cookies();
  const opciones = {
    httpOnly: true,
    sameSite: "lax",
    secure: await servidoPorHttps(),
    path: RUTA_COOKIE,
    maxAge: MINUTOS_BORRADOR_RSVP * 60,
  } as const;

  const trozos = trocear(codificar(borrador), TROZO_COOKIE_BYTES);
  trozos.forEach((trozo, indice) => {
    tarro.set(nombreDelTrozo(NOMBRE_COOKIE, indice), trozo, opciones);
  });

  // Lo que sobre de un borrador anterior más largo se borra: si se quedara,
  // la próxima lectura lo pegaría al final del nuevo.
  const nombres = tarro.getAll().map((cookie) => cookie.name);
  for (const sobrante of trozosSobrantes(nombres, NOMBRE_COOKIE, trozos.length)) {
    tarro.delete({ name: sobrante, path: RUTA_COOKIE });
  }
}

/** Se llama al enviar: la respuesta ya está en la base, el borrador sobra. */
export async function borrarBorrador(): Promise<void> {
  const tarro = await cookies();
  const nombres = tarro.getAll().map((cookie) => cookie.name);
  for (const nombre of trozosSobrantes(nombres, NOMBRE_COOKIE, 0)) {
    tarro.delete({ name: nombre, path: RUTA_COOKIE });
  }
}
