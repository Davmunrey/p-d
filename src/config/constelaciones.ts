/**
 * LAS CONSTELACIONES
 *
 * El único elemento ilustrativo de todo el sistema de marca. No hay iconos, ni
 * ilustraciones, ni fotos decorativas: hay dieciséis mapas de estrellas, y de
 * ahí salen los nombres de las mesas.
 *
 * Ocho del hemisferio norte —el cielo que habrá sobre la finca esa noche— y
 * ocho del sur. La entrega lo dice así y no es un adorno: la mesa de los
 * novios es Lira porque Vega es la estrella más brillante del verano boreal.
 *
 * POR QUÉ VIVE EN `config` Y NO EN UN COMPONENTE
 *
 * Son coordenadas de marca, del mismo orden que un logotipo: pueden cambiar
 * —añadir una constelación, mover una estrella— sin que cambie una línea de la
 * lógica que las dibuja. La regla 1 del proyecto dice dónde va eso.
 *
 * Y no van en la base de datos: no son datos de la boda, que los edita quien
 * organiza, sino la identidad, que se edita con una PR. Cuando se asignen a
 * mesas de verdad (BODA-83), la mesa guardará **la clave**, no el dibujo.
 *
 * EL SISTEMA DE COORDENADAS es un lienzo de 100 × 100 sin unidades, que el SVG
 * escala con `viewBox`. Así el mismo mapa sirve para un marcasitios de 40 px y
 * para un cartel A0 sin tocar un número.
 */

/** Dónde se ve. Decide en qué grupo entra en el catálogo, no cómo se dibuja. */
export type Hemisferio = "norte" | "sur";

export interface Constelacion {
  /** Identificador estable. Es lo que guardará una mesa cuando las haya. */
  clave: string;
  nombre: string;
  hemisferio: Hemisferio;
  /** `[x, y, radio]` en el lienzo de 100 × 100. El radio es el brillo. */
  estrellas: readonly (readonly [number, number, number])[];
  /** Pares de índices sobre `estrellas`. El test comprueba que existen. */
  lineas: readonly (readonly [number, number])[];
}

export const CONSTELACIONES: readonly Constelacion[] = [
  {
    clave: "lira",
    nombre: "Lira",
    hemisferio: "norte",
    estrellas: [
      [50, 9, 1.8],
      [35, 36, 1],
      [65, 40, 1],
      [39, 72, 1],
      [69, 76, 1],
    ],
    lineas: [
      [0, 1],
      [0, 2],
      [1, 3],
      [3, 4],
      [4, 2],
      [1, 2],
    ],
  },
  {
    clave: "casiopea",
    nombre: "Casiopea",
    hemisferio: "norte",
    estrellas: [
      [10, 32, 1],
      [31, 62, 1.3],
      [50, 26, 1.6],
      [72, 60, 1.2],
      [92, 34, 1],
    ],
    lineas: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  },
  {
    clave: "osamayor",
    nombre: "Osa Mayor",
    hemisferio: "norte",
    estrellas: [
      [9, 56, 1.2],
      [24, 70, 1],
      [41, 63, 1],
      [51, 45, 1.4],
      [67, 37, 1.1],
      [81, 43, 1],
      [94, 27, 1.3],
    ],
    lineas: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [3, 4],
      [4, 5],
      [5, 6],
    ],
  },
  {
    clave: "cisne",
    nombre: "Cisne",
    hemisferio: "norte",
    estrellas: [
      [50, 7, 1.6],
      [50, 47, 1.2],
      [50, 92, 1.3],
      [13, 39, 1],
      [87, 44, 1],
    ],
    lineas: [
      [0, 1],
      [1, 2],
      [3, 1],
      [1, 4],
    ],
  },
  {
    clave: "perseo",
    nombre: "Perseo",
    hemisferio: "norte",
    estrellas: [
      [13, 18, 1.1],
      [29, 41, 1.4],
      [46, 33, 1],
      [59, 57, 1.2],
      [74, 49, 1],
      [86, 76, 1],
    ],
    lineas: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [3, 5],
    ],
  },
  {
    clave: "coronaboreal",
    nombre: "Corona Boreal",
    hemisferio: "norte",
    estrellas: [
      [9, 62, 1],
      [20, 40, 1],
      [35, 28, 1.1],
      [51, 24, 1.5],
      [67, 30, 1.1],
      [81, 43, 1],
      [92, 64, 1],
    ],
    lineas: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
    ],
  },
  {
    clave: "aguila",
    nombre: "Águila",
    hemisferio: "norte",
    estrellas: [
      [50, 44, 1.7],
      [37, 26, 1],
      [64, 24, 1],
      [28, 65, 1],
      [72, 67, 1],
      [50, 88, 1.1],
    ],
    lineas: [
      [1, 0],
      [0, 2],
      [3, 0],
      [0, 4],
      [0, 5],
    ],
  },
  {
    clave: "orion",
    nombre: "Orión",
    hemisferio: "norte",
    estrellas: [
      [22, 16, 1.7],
      [73, 13, 1.2],
      [38, 48, 1.1],
      [50, 53, 1.1],
      [62, 58, 1.1],
      [74, 88, 1.2],
      [25, 86, 1.6],
    ],
    lineas: [
      [0, 2],
      [1, 4],
      [2, 3],
      [3, 4],
      [2, 6],
      [4, 5],
      [0, 1],
    ],
  },
  {
    clave: "cruzdelsur",
    nombre: "Cruz del Sur",
    hemisferio: "sur",
    estrellas: [
      [50, 8, 1.6],
      [50, 88, 1.3],
      [15, 50, 1.1],
      [85, 44, 1],
    ],
    lineas: [
      [0, 1],
      [2, 3],
    ],
  },
  {
    clave: "centauro",
    nombre: "Centauro",
    hemisferio: "sur",
    estrellas: [
      [13, 74, 1.6],
      [30, 55, 1.4],
      [48, 46, 1.1],
      [67, 58, 1],
      [83, 40, 1.1],
      [58, 22, 1],
      [37, 19, 1],
    ],
    lineas: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [2, 5],
      [5, 6],
    ],
  },
  {
    clave: "escorpio",
    nombre: "Escorpio",
    hemisferio: "sur",
    estrellas: [
      [10, 16, 1],
      [22, 27, 1.1],
      [34, 15, 1],
      [41, 41, 1.7],
      [51, 57, 1.1],
      [63, 70, 1],
      [75, 80, 1.1],
      [87, 73, 1],
      [91, 57, 1],
    ],
    lineas: [
      [0, 1],
      [1, 2],
      [1, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
    ],
  },
  {
    clave: "tucan",
    nombre: "Tucán",
    hemisferio: "sur",
    estrellas: [
      [17, 71, 1.1],
      [36, 53, 1],
      [56, 44, 1.4],
      [76, 28, 1],
      [88, 53, 1],
    ],
    lineas: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  },
  {
    clave: "fenix",
    nombre: "Fénix",
    hemisferio: "sur",
    estrellas: [
      [14, 26, 1],
      [34, 41, 1.5],
      [53, 30, 1],
      [70, 48, 1.1],
      [87, 30, 1],
      [50, 69, 1],
    ],
    lineas: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [1, 5],
    ],
  },
  {
    clave: "carina",
    nombre: "Carina",
    hemisferio: "sur",
    estrellas: [
      [11, 58, 1.8],
      [30, 42, 1.1],
      [50, 51, 1],
      [70, 34, 1.2],
      [88, 52, 1],
      [58, 74, 1],
    ],
    lineas: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [2, 5],
    ],
  },
  {
    clave: "grulla",
    nombre: "Grulla",
    hemisferio: "sur",
    estrellas: [
      [20, 19, 1],
      [36, 38, 1.4],
      [53, 34, 1.1],
      [65, 55, 1],
      [81, 73, 1],
      [46, 61, 1],
    ],
    lineas: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [2, 5],
    ],
  },
  {
    clave: "vela",
    nombre: "Vela",
    hemisferio: "sur",
    estrellas: [
      [15, 40, 1.2],
      [38, 27, 1],
      [60, 41, 1.1],
      [83, 30, 1],
      [50, 67, 1],
    ],
    lineas: [
      [0, 1],
      [1, 2],
      [2, 3],
      [1, 4],
      [2, 4],
    ],
  },
] as const;

/** Búsqueda por clave. La usan el componente y, más adelante, el plano de mesas. */
export function constelacionPorClave(clave: string): Constelacion | undefined {
  return CONSTELACIONES.find((constelacion) => constelacion.clave === clave);
}

/**
 * La constelación de los novios. Es la que abre el sistema de marca y la que
 * lleva el Save the Date, y por eso tiene nombre propio en lugar de aparecer
 * como una cadena suelta en dos sitios distintos.
 */
export const CONSTELACION_NOVIOS = "lira";

/**
 * Grosor de la línea, en unidades del lienzo de 100. Va aquí y no como número
 * suelto en el componente porque es geometría del dibujo, igual que las
 * coordenadas: una línea más gruesa deja de parecer un mapa del cielo.
 */
export const GROSOR_TRAZO = 0.7;
