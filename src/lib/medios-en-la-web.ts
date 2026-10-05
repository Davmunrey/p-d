import type { Seccion } from "@/config/secciones";

/**
 * QUÉ MEDIO SE VE DE VERDAD EN LA WEB
 *
 * «Publicado» no es «se ve». El gestor de medios marcaba «En la web» todo lo
 * publicado, y avisaba «Ya se ve en la web» al publicar, en las dieciséis
 * secciones. Pero la landing pinta muy poco de lo que hay:
 *
 *   · portada y paisaje, LA PRIMERA por orden;
 *   · la tarjeta del Save the Date, LA PRIMERA FOTO (no vídeos);
 *   · la galería, las fotos CON MEDIDAS —una rejilla no reserva hueco para lo
 *     que no sabe cuánto mide—;
 *   · historia y alojamiento, la que se ELIGE EN UNA FICHA publicada;
 *   · y las demás secciones, NINGUNA.
 *
 * Es la misma regla que aplican `obtenerMedios`, `obtenerGaleria` y las
 * fichas de Contenido, escrita aquí una vez, sin base de datos y con unitarios:
 * el fallo no da error, sólo se ve comparando el panel con la web.
 */

type ComoSePinta = "la-primera" | "la-primera-foto" | "con-medidas" | "por-ficha";

const COMO_SE_PINTA: Partial<Record<Seccion, ComoSePinta>> = {
  portada: "la-primera",
  paisaje: "la-primera",
  reserva_la_fecha: "la-primera-foto",
  galeria: "con-medidas",
  historia: "por-ficha",
  alojamiento: "por-ficha",
};

/** Si esa parte de la web enseña algún medio. Si no, no se ofrece subir nada. */
export function seccionEnsenaMedios(seccion: Seccion): boolean {
  return COMO_SE_PINTA[seccion] !== undefined;
}

export type MotivoNoSeVe =
  | "borrador"
  | "solo-la-primera"
  | "solo-la-primera-foto"
  | "sin-medidas"
  | "sin-ficha"
  | "seccion-sin-medios";

export type Visibilidad = { seVe: true } | { seVe: false; motivo: MotivoNoSeVe };

export interface MedioParaPintar {
  id: string;
  publicado: boolean;
  tipo: "imagen" | "video";
  ancho: number | null;
  alto: number | null;
}

/**
 * Lo que pasa con cada medio de UNA sección.
 *
 * `medios` llega en el orden de la web (`orden`, y a igualdad, el más antiguo
 * primero), que es el mismo con el que se lee aquí: «la primera» es la primera
 * PUBLICADA. `elegidos` son los que alguna ficha publicada de Contenido usa.
 */
export function visibilidadEnLaWeb(
  seccion: Seccion,
  medios: readonly MedioParaPintar[],
  elegidos: ReadonlySet<string>,
): Map<string, Visibilidad> {
  const como = COMO_SE_PINTA[seccion];
  const publicados = medios.filter((medio) => medio.publicado);

  const laPrimera =
    como === "la-primera"
      ? publicados[0]?.id
      : como === "la-primera-foto"
        ? publicados.find((medio) => medio.tipo === "imagen")?.id
        : undefined;

  const resultado = new Map<string, Visibilidad>();
  for (const medio of medios) {
    resultado.set(medio.id, deUno(medio, como, laPrimera, elegidos));
  }
  return resultado;
}

function deUno(
  medio: MedioParaPintar,
  como: ComoSePinta | undefined,
  laPrimera: string | undefined,
  elegidos: ReadonlySet<string>,
): Visibilidad {
  if (!medio.publicado) return { seVe: false, motivo: "borrador" };

  switch (como) {
    case undefined:
      return { seVe: false, motivo: "seccion-sin-medios" };
    case "la-primera":
      return medio.id === laPrimera
        ? { seVe: true }
        : { seVe: false, motivo: "solo-la-primera" };
    case "la-primera-foto":
      return medio.id === laPrimera
        ? { seVe: true }
        : { seVe: false, motivo: "solo-la-primera-foto" };
    case "con-medidas":
      return medio.tipo === "imagen" && medio.ancho !== null && medio.alto !== null
        ? { seVe: true }
        : { seVe: false, motivo: "sin-medidas" };
    case "por-ficha":
      return elegidos.has(medio.id) ? { seVe: true } : { seVe: false, motivo: "sin-ficha" };
  }
}
