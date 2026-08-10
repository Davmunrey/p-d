import "server-only";

import { huellaDePeticion } from "@/lib/huella-peticion";

import { llamarComoAnonimo } from "./cliente";

/**
 * APUNTAR UNA CANCIÓN EN LA PLAYLIST
 *
 * La única escritura pública de la web además del RSVP, y pasa por
 * `sugerir_cancion()`, que es `security definer` y decide sola qué acepta:
 * exige un token de invitación válido, limita la longitud del texto y no deja
 * pasar de diez canciones por grupo. Aquí no se vuelve a comprobar nada de
 * eso — repetir una regla es tener dos sitios donde puede cambiar sólo uno.
 *
 * DOS SITIOS LLAMAN A ESTO Y POR ESO VIVE APARTE. La portada, cuando alguien
 * escribe en el campo de la playlist, y el RSVP, que manda la canción del
 * formulario de confirmación. Los códigos de error de la base los traduce este
 * fichero una vez para los dos.
 *
 * NO LANZA NUNCA. Devuelve por qué no ha podido, y quien llama decide qué
 * hacer: la portada lo enseña, el RSVP lo apunta en el registro y sigue —
 * perder una confirmación de asistencia porque la canción número once no cabía
 * sería un intercambio pésimo.
 */

/** Códigos con los que la base cuenta qué ha pasado al sugerir una canción. */
export const MOTIVOS_CANCION = {
  /** CAN01 · el texto está vacío, es de una letra o pasa de 160. */
  textoInvalido: "CAN01",
  /** CAN02 · el token no corresponde a ninguna invitación. */
  enlaceInvalido: "CAN02",
  /** CAN03 · ese grupo ya ha apuntado diez. */
  topeDelGrupo: "CAN03",
  /** RSV02 · demasiados intentos desde el mismo sitio; lo pone el cortafuegos. */
  demasiadosIntentos: "RSV02",
} as const;

export type MotivoCancion = "texto" | "enlace" | "tope" | "intentos" | "averia";

export type ResultadoCancion = { ok: true } | { ok: false; motivo: MotivoCancion };

export async function sugerirCancion(token: string, texto: string): Promise<ResultadoCancion> {
  try {
    await llamarComoAnonimo(
      (tx) => tx`select public.sugerir_cancion(${token}, ${texto})`,
      await huellaDePeticion(),
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, motivo: motivoDe(error) };
  }
}

/**
 * Se mira el mensaje porque es donde `raise exception 'CAN01'` deja el código,
 * igual que en el RSVP.
 *
 * LO DESCONOCIDO ES UNA AVERÍA, NO CULPA DE QUIEN ESCRIBE. Decirle «vuestro
 * enlace no vale» a alguien cuya única falta es que la base no responde es la
 * peor traducción posible: se queda convencido de que su invitación está rota.
 */
function motivoDe(error: unknown): MotivoCancion {
  const texto = error instanceof Error ? error.message : String(error);

  if (texto.includes(MOTIVOS_CANCION.textoInvalido)) return "texto";
  if (texto.includes(MOTIVOS_CANCION.enlaceInvalido)) return "enlace";
  if (texto.includes(MOTIVOS_CANCION.topeDelGrupo)) return "tope";
  if (texto.includes(MOTIVOS_CANCION.demasiadosIntentos)) return "intentos";
  return "averia";
}
