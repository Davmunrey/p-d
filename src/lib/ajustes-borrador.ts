import "server-only";

import { cookies } from "next/headers";

import { MINUTOS_BORRADOR_AJUSTES, RUTA_AJUSTES, TROZO_COOKIE_BYTES } from "@/config/constants";
import {
  codificar,
  decodificar,
  nombreDelTrozo,
  trocear,
  trozosSobrantes,
  unirTrozos,
} from "@/lib/cookie-troceada";
import { servidoPorHttps } from "@/lib/rsvp-borrador";

/**
 * LO QUE SE ESCRIBIÓ EN AJUSTES, CUANDO EL SERVIDOR LO RECHAZA
 *
 * Ajustes es un formulario de veinte campos que funciona sin JavaScript: cada
 * envío es un `POST` y una redirección, y la página se vuelve a pintar con lo
 * que hay en la base. Un error en un campo —una fecha límite posterior a la
 * boda, media coordenada— deshacía todo lo demás que se había escrito: el
 * lugar, la dirección, la frase del paisaje volvían a lo de antes, y al
 * corregir la fecha y guardar, lo demás no llegaba a guardarse sin que nadie
 * lo dijera.
 *
 * Se guarda lo enviado en una cookie —troceada, como el borrador del RSVP, por
 * si los textos largos pasan de 4 KB— y la página lo prefiere a la base sólo
 * cuando vuelve con un error. Al guardar bien, se borra.
 */

const NOMBRE_COOKIE = "boda:ajustes";

/** Campo → lo que se escribió en él. */
export type BorradorAjustes = Record<string, string>;

export async function leerBorradorAjustes(): Promise<BorradorAjustes | null> {
  const tarro = await cookies();
  const bruto = unirTrozos((nombre) => tarro.get(nombre)?.value, NOMBRE_COOKIE);
  if (!bruto) return null;

  const leido = decodificar(bruto);
  if (!leido || typeof leido !== "object" || Array.isArray(leido)) return null;
  return Object.fromEntries(
    Object.entries(leido).filter((par): par is [string, string] => typeof par[1] === "string"),
  );
}

export async function guardarBorradorAjustes(datos: FormData): Promise<void> {
  // Sólo los campos del formulario: los `$ACTION_…` los añade React al enviar.
  const escrito: BorradorAjustes = {};
  for (const [campo, valor] of datos.entries()) {
    if (!campo.startsWith("$") && typeof valor === "string") escrito[campo] = valor;
  }

  const tarro = await cookies();
  const opciones = {
    httpOnly: true,
    sameSite: "lax",
    secure: await servidoPorHttps(),
    path: RUTA_AJUSTES,
    maxAge: MINUTOS_BORRADOR_AJUSTES * 60,
  } as const;

  const trozos = trocear(codificar(escrito), TROZO_COOKIE_BYTES);
  trozos.forEach((trozo, indice) => {
    tarro.set(nombreDelTrozo(NOMBRE_COOKIE, indice), trozo, opciones);
  });

  const nombres = tarro.getAll().map((cookie) => cookie.name);
  for (const sobrante of trozosSobrantes(nombres, NOMBRE_COOKIE, trozos.length)) {
    tarro.delete({ name: sobrante, path: RUTA_AJUSTES });
  }
}

/** Guardado bien: lo escrito ya está en la base y el borrador sobra. */
export async function borrarBorradorAjustes(): Promise<void> {
  const tarro = await cookies();
  const nombres = tarro.getAll().map((cookie) => cookie.name);
  for (const nombre of trozosSobrantes(nombres, NOMBRE_COOKIE, 0)) {
    tarro.delete({ name: nombre, path: RUTA_AJUSTES });
  }
}
