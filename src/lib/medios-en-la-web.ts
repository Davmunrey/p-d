import { TIPOS_MEDIO_ADMITIDOS, TIPOS_RETRATO } from "@/config/constants";
import type { Seccion } from "@/config/secciones";

/**
 * QUÉ MEDIO SE VE DE VERDAD EN LA WEB
 *
 * «Publicado» no es «se ve». El gestor de medios marcaba «En la web» todo lo
 * publicado, y avisaba «Ya se ve en la web» al publicar, en todas las
 * secciones. Pero la landing pinta muy poco de lo que hay:
 *
 *   · la portada, LA PRIMERA por orden;
 *   · la tarjeta del Save the Date, LA PRIMERA FOTO (no vídeos);
 *   · alojamiento y planes, la que se ELIGE EN UNA FICHA publicada;
 *   · el retrato de estrellas, LA PRIMERA, y sólo recortada (con transparencia);
 *   · y las demás secciones, NINGUNA.
 *
 * Es la misma regla que aplican `obtenerMedios`, `obtenerRetrato` y las
 * fichas de Contenido, escrita aquí una vez, sin base de datos y con unitarios:
 * el fallo no da error, sólo se ve comparando el panel con la web.
 */

type ComoSePinta = "la-primera" | "la-primera-foto" | "por-ficha" | "recortada";

const COMO_SE_PINTA: Partial<Record<Seccion, ComoSePinta>> = {
  portada: "la-primera",
  reserva_la_fecha: "la-primera-foto",
  alojamiento: "por-ficha",
  planes: "por-ficha",
  retrato: "recortada",
};

/** Si esa parte de la web enseña algún medio. Si no, no se ofrece subir nada. */
export function seccionEnsenaMedios(seccion: Seccion): boolean {
  return COMO_SE_PINTA[seccion] !== undefined;
}

/**
 * QUÉ FORMATOS LLEGA A PINTAR CADA FORMA DE PINTAR. La portada enseña foto o
 * vídeo; la tarjeta del Save the Date y las fichas de alojamiento y planes,
 * sólo fotos.
 */
const PINTA: Record<ComoSePinta, (tipo: string) => boolean> = {
  "la-primera": () => true,
  "la-primera-foto": (tipo) => tipo.startsWith("image/"),
  "por-ficha": (tipo) => tipo.startsWith("image/"),
  // Sólo formatos con canal alfa: lo que se traza es el borde de lo opaco.
  recortada: (tipo) => (TIPOS_RETRATO as readonly string[]).includes(tipo),
};

/**
 * Los tipos que se admiten al subir a una sección: los que la web va a pintar.
 *
 * Antes se admitían todos en todas, y un vídeo subido a una sección de fichas
 * se quedaba en «Publicada, no se ve» con un motivo que mandaba a elegirlo en una
 * ficha de Contenido... donde el selector sólo ofrece fotos.
 */
export function tiposQuePinta(seccion: Seccion): string[] {
  const como = COMO_SE_PINTA[seccion];
  return como ? TIPOS_MEDIO_ADMITIDOS.filter(PINTA[como]) : [];
}

export type MotivoNoSeVe =
  | "borrador"
  | "solo-la-primera"
  | "solo-la-primera-foto"
  | "sin-ficha"
  | "solo-fotos"
  | "seccion-sin-medios"
  | "seccion-oculta";

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
 *
 * `seccionVisible` es si la web pinta esa parte: apagada en Contenido, nada de
 * lo publicado en ella se ve, y la pantalla decía
 * «En la web» de fotos que no veía nadie.
 */
export function visibilidadEnLaWeb(
  seccion: Seccion,
  medios: readonly MedioParaPintar[],
  elegidos: ReadonlySet<string>,
  seccionVisible = true,
): Map<string, Visibilidad> {
  const como = COMO_SE_PINTA[seccion];
  const publicados = medios.filter((medio) => medio.publicado);

  const laPrimera =
    como === "la-primera"
      ? publicados[0]?.id
      : como === "la-primera-foto" || como === "recortada"
        ? publicados.find((medio) => medio.tipo === "imagen")?.id
        : undefined;

  const resultado = new Map<string, Visibilidad>();
  for (const medio of medios) {
    resultado.set(
      medio.id,
      medio.publicado && como && !seccionVisible
        ? { seVe: false, motivo: "seccion-oculta" }
        : deUno(medio, como, laPrimera, elegidos),
    );
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
    case "recortada":
      return medio.id === laPrimera
        ? { seVe: true }
        : { seVe: false, motivo: "solo-la-primera" };
    case "la-primera-foto":
      return medio.id === laPrimera
        ? { seVe: true }
        : { seVe: false, motivo: "solo-la-primera-foto" };
    case "por-ficha":
      // Un vídeo no se puede elegir en una ficha: mandar a elegirlo era mentir.
      if (medio.tipo !== "imagen") return { seVe: false, motivo: "solo-fotos" };
      return elegidos.has(medio.id) ? { seVe: true } : { seVe: false, motivo: "sin-ficha" };
  }
}
