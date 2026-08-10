"use server";

import { revalidatePath } from "next/cache";

import { sugerirCancion, type MotivoCancion } from "@/lib/bbdd/playlist";
import { t } from "@/lib/copy";
import { invitacionRecordada } from "@/lib/invitacion-recordada";

import { type EstadoPlaylist } from "./estado-playlist";

/**
 * BODA-27 · APUNTAR UNA CANCIÓN DESDE LA PORTADA
 *
 * El token no viaja en el formulario: se saca de la cookie que dejó el enlace
 * de invitación. Mandarlo en un campo oculto sería ponerlo en el HTML de una
 * página pública y en el historial del navegador, y ese token abre los datos
 * de una familia entera.
 *
 * SE VALIDA EN LA BASE, NO AQUÍ. `sugerir_cancion()` comprueba el token, la
 * longitud y el tope de diez por grupo; esta acción sólo traduce lo que
 * responde. Lo único que se mira antes de llamar es que haya algo escrito, y
 * eso porque un campo vacío no merece un viaje a la base.
 */
export async function anadirCancion(
  previo: EstadoPlaylist,
  datos: FormData,
): Promise<EstadoPlaylist> {
  const sello = previo.sello + 1;
  const texto = String(datos.get("cancion") ?? "").trim();

  if (!texto) {
    return { fase: "fallo", aviso: t("playlist.errorVacio"), texto: "", sello };
  }

  const token = await invitacionRecordada();
  if (!token) {
    return { fase: "fallo", aviso: t("playlist.sinInvitacion"), texto, sello };
  }

  const resultado = await sugerirCancion(token, texto);

  if (!resultado.ok) {
    return { fase: "fallo", aviso: AVISOS[resultado.motivo](), texto, sello };
  }

  /*
    La portada es `force-dynamic`, así que se vuelve a pintar sola en la
    respuesta de esta acción y la canción recién apuntada aparece en la lista
    sin recargar. `revalidatePath` está igualmente porque sin él la lista se
    serviría de la caché del router al volver a la portada desde otra página:
    la canción estaría en la base y no en la pantalla, que es la forma más
    segura de que alguien la apunte dos veces.
  */
  revalidatePath("/");

  return { fase: "apuntada", aviso: null, texto: "", sello };
}

/**
 * Cada motivo, su frase. Funciones y no cadenas: `t()` lee el copy al
 * llamarla, y un objeto de cadenas se evaluaría al cargar el módulo.
 */
const AVISOS: Record<MotivoCancion, () => string> = {
  texto: () => t("playlist.errorTexto"),
  enlace: () => t("playlist.errorEnlace"),
  tope: () => t("playlist.errorTope"),
  intentos: () => t("playlist.errorIntentos"),
  averia: () => t("playlist.errorAveria"),
};
