import type { Seccion } from "./secciones";

/**
 * EL CIELO ESTRELLADO, MEDIDO
 *
 * La landing es un día entero: empieza de noche, amanece para la logística y
 * vuelve a ser de noche al final. Las noches son un firmamento completo —no
 * una constelación suelta—, pintado en un `<canvas>` por `CieloEstrellado`.
 *
 * Aquí viven los números del dibujo: cuántas estrellas por superficie, de qué
 * tamaño, con qué brillo, cuánto titilan y cuánto se mueven al bajar. Son
 * geometría y ritmo, como las coordenadas de `constelaciones.ts`; los colores
 * no están aquí: los lee el lienzo de los tokens (`--cielo-*`), así que
 * cambiar de paleta no toca este fichero.
 *
 * TODO SALE DE UNA SEMILLA. Las estrellas se reparten con un generador
 * pseudoaleatorio con semilla fija: el cielo es el mismo en cada visita y en
 * cada pantalla —no «se reordena» al girar el móvil— y los tests pueden contar
 * con él.
 */

/**
 * Las semillas de cada cielo: la fecha de la boda, 21·05·27, y un número de
 * cielo detrás. Cada noche de la página tiene su firmamento —repetir el mismo
 * en la portada y en el final se notaría—, y cada una es siempre la misma.
 */
export const SEMILLAS_CIELO = {
  portada: 2105271,
  cuentaAtras: 2105272,
  historia: 2105273,
  final: 2105274,
} as const;

/**
 * Las tres profundidades del cielo. De lejos a cerca: más estrellas y más
 * pequeñas al fondo, pocas y brillantes delante. Lo que da profundidad es el
 * contraste entre las tres, no ninguna por separado.
 *
 * - `densidad`: estrellas por cada millón de píxeles CSS de lienzo. A 1440×900
 *   salen unas 440, 120 y 25; en un móvil de 390×844, unas 110, 30 y 6.
 * - `radio`: de cuánto a cuánto, en píxeles CSS.
 * - `brillo`: opacidad de cuánto a cuánto.
 * - `titilan`: qué parte de la capa titila. Las de fondo casi no: un fondo
 *   entero parpadeando es ruido, no un cielo.
 * - `paralaje`: cuánto se desplaza la capa por cada píxel de scroll. Las de
 *   cerca se mueven más, y eso es lo que se lee como profundidad.
 * - `retardo`: cuándo se enciende al llegar, en milisegundos. Primero el
 *   fondo, luego lo de delante: el cielo «se abre» en vez de aparecer.
 */
export const CAPAS_CIELO = [
  {
    clave: "lejos",
    densidad: 340,
    radio: [0.35, 0.7],
    brillo: [0.22, 0.5],
    titilan: 0.15,
    paralaje: 0.03,
    retardo: 0,
  },
  {
    clave: "medio",
    densidad: 92,
    radio: [0.6, 1.05],
    brillo: [0.45, 0.8],
    titilan: 0.4,
    paralaje: 0.07,
    retardo: 260,
  },
  {
    clave: "cerca",
    densidad: 19,
    radio: [1, 1.65],
    brillo: [0.75, 1],
    titilan: 0.7,
    paralaje: 0.13,
    retardo: 520,
  },
] as const;

export type CapaCielo = (typeof CAPAS_CIELO)[number];

/**
 * El tope de estrellas por capa, pase lo que pase con la pantalla. Un monitor
 * 4K a pantalla completa pediría miles; a partir de aquí no se ve más cielo,
 * sólo se gasta batería.
 */
export const MAXIMO_ESTRELLAS_POR_CAPA = 520;

/**
 * Cuántas veces más denso es el cielo de la ventana de «nuestra historia».
 * Es un círculo de unos cientos de píxeles: con la densidad de la portada
 * salían cuarenta estrellas y se leía como un fondo vacío, no como un cielo.
 */
export const DENSIDAD_VENTANA_HISTORIA = 2.6;

/** Qué parte de las estrellas brillantes tira a cálido (el bronce de la marca). */
export const PROPORCION_ESTRELLAS_CALIDAS = 0.18;

/**
 * El halo de las estrellas de delante: cuántas veces su radio. Sólo la capa
 * de cerca lo lleva: un halo en cada estrella es niebla.
 */
export const ESCALA_HALO_ESTRELLA = 4;

/** Cuánto brilla el centro del halo respecto a la estrella. */
export const BRILLO_HALO = 0.35;

/**
 * LA VÍA LÁCTEA: una franja en diagonal, de abajo a la izquierda a arriba a la
 * derecha, más densa de estrellas y con un velo de luz. En proporciones del
 * lienzo. `refuerzo` es cuántas estrellas de fondo más caben dentro de la
 * franja que fuera.
 */
export const VIA_LACTEA = {
  desde: [0, 0.82],
  hasta: [1, 0.12],
  anchura: 0.2,
  refuerzo: 2.2,
} as const;

/** Cuánto dura un titileo, de cuánto a cuánto, en milisegundos. */
export const PERIODO_TITILEO_MS = [2400, 6500] as const;

/** Cuánto baja el brillo en lo más hondo del titileo (0 = nada, 1 = se apaga). */
export const AMPLITUD_TITILEO = 0.55;

/** Cuánto tarda cada capa en encenderse del todo al llegar. */
export const DURACION_ENCENDIDO_MS = 1600;

/**
 * Los fotogramas por segundo del cielo. Titilar no necesita sesenta: a treinta
 * no se nota la diferencia y el móvil gasta la mitad.
 */
export const FOTOGRAMAS_CIELO = 30;

/** La densidad de píxeles máxima del lienzo: más allá no se ve y pesa el doble. */
export const DENSIDAD_PIXELES_MAXIMA = 2;

/**
 * LAS ESTRELLAS FUGACES. Una cada tantos segundos —al azar dentro del margen—,
 * en diagonal y de izquierda a derecha, y la primera poco después de llegar,
 * cuando los nombres ya están en su sitio.
 */
export const FUGACES = {
  primeraMs: 2600,
  intervaloMs: [5200, 11000],
  duracionMs: 900,
  /** El largo de la estela, en proporción del ancho del lienzo. */
  estela: 0.16,
  /** El ángulo de caída, en grados bajo la horizontal, de cuánto a cuánto. */
  angulo: [12, 24],
  grosor: 1.2,
} as const;

/**
 * LAS ESTRELLAS DE «NUESTRA HISTORIA»: una por hito, en un camino que cruza el
 * cielo de izquierda a derecha sin formar ninguna figura. En proporciones del
 * escenario: de dónde a dónde va en horizontal, por qué franja vertical se
 * mueve, y cuánto se desvía cada una al azar.
 */
export const CAMINO_HISTORIA = {
  margen: 0.14,
  franja: [0.24, 0.76],
  desvio: 0.06,
  /** Radio de cada estrella del camino, en unidades del lienzo de 100. */
  radio: 1.5,
  /** El halo al encenderse, en veces su radio. */
  halo: 3.4,
} as const;

/**
 * EL DÍA, SECCIÓN A SECCIÓN. La landing empieza de noche (la portada), amanece
 * con la historia, pasa la tarde con la logística y cae al ocaso con lo que se
 * ofrece; el final vuelve a ser de noche. Las secciones de noche pintan su
 * propio cielo; las demás dejan ver el tinte de su hora, que cambia cuando la
 * sección llega a la mitad de la pantalla.
 *
 * Una sección que no está en la lista no cambia la hora: la que había sigue.
 */
export type FaseCielo = "noche" | "alba" | "tarde" | "ocaso";

export const FASE_DE_SECCION = {
  portada: "noche",
  paisaje: "alba",
  cuenta_atras: "alba",
  historia: "alba",
  galeria: "alba",
  preboda: "tarde",
  programa: "tarde",
  ubicaciones: "tarde",
  transporte: "tarde",
  alojamiento: "tarde",
  preguntas_frecuentes: "ocaso",
  playlist: "ocaso",
  regalos: "ocaso",
  dresscode: "ocaso",
  rsvp: "noche",
} as const satisfies Partial<Record<Seccion, FaseCielo>>;

/**
 * La línea que decide la hora: el centro de la ventana, como margen de un
 * `IntersectionObserver` (arriba y abajo se recorta la mitad).
 */
export const LINEA_DE_LA_HORA = "-50% 0px -50% 0px";

/**
 * VUESTRA ESTRELLA, en el lienzo de 100 de su dibujo: el anillo hueco, su
 * grosor y el de la onda que sale de él y se apaga al crecer, como un latido
 * (`--escala-latido-estrella`; el svg deja que se salga).
 */
export const RADIO_VUESTRA_ESTRELLA = { anillo: 12, grosor: 2.5, onda: 1.5 } as const;
