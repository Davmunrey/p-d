import "server-only";

import { huellaDePeticion } from "@/lib/huella-peticion";

import { ErrorDeLectura, leerComoAnonimo, llamarComoAnonimo } from "./cliente";

/**
 * LA CONFIRMACIÓN DESDE EL ENLACE DE CADA INVITACIÓN
 *
 * Dos puertas de la base, las dos como `anon` y con la huella de la petición,
 * que es lo que cuenta el cortafuegos:
 *
 *   · `obtener_invitacion(token)`  — el grupo y sus personas, con la respuesta
 *                                    vigente de cada una. CERO FILAS es enlace
 *                                    no válido: no lanza, para que el intento
 *                                    fallido quede anotado.
 *   · `registrar_confirmacion(…)`  — escribe la respuesta del grupo. Sólo por
 *                                    personas de SU grupo, y el plazo lo mira
 *                                    la base contra `now()`.
 *
 * El token nunca viaja en un formulario ni en la URL: lo lee el servidor de la
 * cookie que deja el enlace al abrirse (`invitacionRecordada`).
 */

/** Los códigos con que la base explica por qué no guarda una respuesta. */
export const MOTIVOS_RSVP = {
  demasiadosIntentos: "RSV02",
  plazoCerrado: "RSV03",
  respuestasInvalidas: "RSV04",
} as const;

export interface PersonaInvitada {
  id: string;
  nombre: string;
  apellidos: string | null;
  esNino: boolean;
  esAcompanante: boolean;
  tipoMenu: string;
  alergias: string | null;
  estado: string | null;
  respondidoEn: Date | null;
  necesitaAutobus: boolean | null;
}

export interface Invitacion {
  grupoNombre: string;
  personas: PersonaInvitada[];
}

interface FilaInvitacion {
  grupo_nombre: string;
  invitado_id: string;
  nombre: string;
  apellidos: string | null;
  es_nino: boolean;
  es_acompanante: boolean;
  tipo_menu: string;
  alergias: string | null;
  estado: string | null;
  respondido_en: Date | null;
  necesita_autobus: boolean | null;
}

/**
 * El grupo del enlace, o `null` si el enlace no vale. Lanza si la base no
 * responde o si salta el cortafuegos (ver `esCupoAgotado`): quien lo llama
 * decide qué contar en cada caso.
 */
export async function obtenerInvitacion(token: string): Promise<Invitacion | null> {
  const filas = await leerComoAnonimo(
    (tx) => tx<FilaInvitacion[]>`select * from public.obtener_invitacion(${token})`,
    await huellaDePeticion(),
  );
  if (filas.length === 0) return null;

  const [primera] = filas;
  return {
    grupoNombre: primera.grupo_nombre,
    personas: filas.map((f) => ({
      id: f.invitado_id,
      nombre: f.nombre,
      apellidos: f.apellidos,
      esNino: f.es_nino,
      esAcompanante: f.es_acompanante,
      tipoMenu: f.tipo_menu,
      alergias: f.alergias,
      estado: f.estado,
      respondidoEn: f.respondido_en,
      necesitaAutobus: f.necesita_autobus,
    })),
  };
}

/** Lo que se manda por cada persona: viene o no, y si viene, su logística. */
export type RespuestaInvitado = {
  invitado_id: string;
  estado: "confirmado" | "rechazado";
  necesita_autobus: boolean | null;
  necesita_alojamiento: boolean | null;
  tipo_menu?: string;
  alergias?: string | null;
};

export type ResultadoConfirmacion =
  | { ok: true; registradas: number }
  | { ok: false; motivo: "enlace" | "plazo" | "intentos" | "respuestas" | "averia" };

/**
 * Guarda la respuesta del grupo. Nunca lanza: cada fallo vuelve con su motivo,
 * que es lo que la pantalla sabe contar.
 */
export async function registrarConfirmacion(
  token: string,
  respuestas: RespuestaInvitado[],
): Promise<ResultadoConfirmacion> {
  try {
    const filas = await llamarComoAnonimo(
      (tx) => tx<{ registrar_confirmacion: number }[]>`
        select public.registrar_confirmacion(${token}, ${tx.json(respuestas)})
      `,
      await huellaDePeticion(),
    );
    const registradas = filas[0]?.registrar_confirmacion ?? 0;
    // Cero es «enlace no válido»: la base no lanza para no perder el intento.
    if (registradas === 0) return { ok: false, motivo: "enlace" };
    return { ok: true, registradas };
  } catch (error) {
    return { ok: false, motivo: motivoDe(error) };
  }
}

function motivoDe(error: unknown): "plazo" | "intentos" | "respuestas" | "averia" {
  const texto = error instanceof Error ? error.message : String(error);
  if (texto.includes(MOTIVOS_RSVP.plazoCerrado)) return "plazo";
  if (texto.includes(MOTIVOS_RSVP.demasiadosIntentos)) return "intentos";
  if (texto.includes(MOTIVOS_RSVP.respuestasInvalidas)) return "respuestas";
  console.error("Fallo al registrar la confirmación:", error);
  return "averia";
}

/**
 * Si una lectura falló porque saltó el cortafuegos (RSV02) y no por una
 * avería: son dos cosas distintas que contar a quien está delante.
 */
export function esCupoAgotado(error: unknown): boolean {
  const causa = error instanceof ErrorDeLectura ? error.cause : error;
  const texto = causa instanceof Error ? causa.message : String(causa);
  return texto.includes(MOTIVOS_RSVP.demasiadosIntentos);
}
