import "server-only";

import { cookies, headers } from "next/headers";

import { MINUTOS_BORRADOR_RSVP, RUTA_RSVP } from "@/config/constants";

/**
 * EL BORRADOR DEL RSVP
 *
 * El formulario tiene tres pasos y funciona sin una línea de JavaScript, así
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
 */

export interface Borrador {
  token: string;
  /** `invitado_id` → viene o no viene. */
  asistencia: Record<string, "confirmado" | "rechazado">;
  menu: Record<string, string>;
  alergias: Record<string, string>;
  autobus: Record<string, boolean>;
  cancion: string;
  mensaje: string;
}

const NOMBRE_COOKIE = "boda:rsvp";

export function borradorVacio(token: string): Borrador {
  return {
    token,
    asistencia: {},
    menu: {},
    alergias: {},
    autobus: {},
    cancion: "",
    mensaje: "",
  };
}

/**
 * Lee el borrador del token dado. Devuelve uno vacío si no hay, si está roto o
 * si es de otro enlace: en ningún caso lanza. Perder un borrador es molesto;
 * romper la pantalla del RSVP por una cookie mal formada es mucho peor.
 */
export async function leerBorrador(token: string): Promise<Borrador> {
  const bruto = (await cookies()).get(NOMBRE_COOKIE)?.value;
  if (!bruto) return borradorVacio(token);

  try {
    const guardado = JSON.parse(bruto) as Partial<Borrador>;
    if (guardado.token !== token) return borradorVacio(token);

    return {
      ...borradorVacio(token),
      ...guardado,
      token,
    };
  } catch {
    return borradorVacio(token);
  }
}

/**
 * `Secure` sí, pero según cómo se esté sirviendo la página y no según
 * `NODE_ENV`.
 *
 * Parece un matiz y no lo es. Con `NODE_ENV === "production"` la cookie salía
 * marcada `Secure` también en una compilación de producción servida por `http`
 * —que es como corren los tests E2E—, y ahí Safari **la descarta en silencio**.
 * Chromium no: trata `http://localhost` como contexto seguro y la guarda. O
 * sea, que el RSVP funcionaba en Chrome y en Safari se quedaba clavado en el
 * primer paso, sin un solo error.
 *
 * Safari en el móvil es exactamente el navegador de esta pantalla, así que el
 * fallo estaba donde más caro sale. Se mira el protocolo real de la petición:
 * detrás de Vercel llega `https` y la cookie va protegida; en local y en CI
 * llega `http` y no se marca, que es lo correcto para un `http` de verdad.
 */
async function servidoPorHttps(): Promise<boolean> {
  return (await headers()).get("x-forwarded-proto") === "https";
}

export async function guardarBorrador(borrador: Borrador): Promise<void> {
  (await cookies()).set(NOMBRE_COOKIE, JSON.stringify(borrador), {
    httpOnly: true,
    sameSite: "lax",
    secure: await servidoPorHttps(),
    path: RUTA_RSVP,
    maxAge: MINUTOS_BORRADOR_RSVP * 60,
  });
}

/** Se llama al enviar: la respuesta ya está en la base, el borrador sobra. */
export async function borrarBorrador(): Promise<void> {
  (await cookies()).delete({ name: NOMBRE_COOKIE, path: RUTA_RSVP });
}
