import type { Seccion } from "./secciones";

/**
 * EL CIELO DE LA LANDING, MEDIDO
 *
 * La landing es un día entero sobre un solo fondo: empieza de noche, bajo un
 * firmamento completo, amanece a media página y acaba de día, en el mapa del
 * sitio de la boda. Las estrellas se pintan en un `<canvas>` (`CieloEstrellado`)
 * y el firmamento GIRA mientras se baja, como gira de verdad a lo largo de una
 * noche: lo que se ve arriba al empezar no es lo que se ve al acabar.
 *
 * Aquí viven los números del dibujo: cuántas estrellas por superficie, de qué
 * tamaño, con qué brillo, cuánto titilan, cuánto gira el cielo y cuándo se
 * apaga. Son geometría y ritmo; los colores no están aquí: los lee el lienzo de
 * los tokens (`--cielo-*`), así que cambiar de paleta no toca este fichero.
 *
 * TODO SALE DE UNA SEMILLA. Las estrellas se reparten con un generador
 * pseudoaleatorio con semilla fija: el cielo es el mismo en cada visita y en
 * cada pantalla —no «se reordena» al girar el móvil— y los tests pueden contar
 * con él. El número no significa nada: sólo tiene que ser siempre el mismo.
 */
export const SEMILLA_CIELO = 2105271;

/**
 * Las tres profundidades del cielo. De lejos a cerca: más estrellas y más
 * pequeñas al fondo, pocas y brillantes delante. Lo que da profundidad es el
 * contraste entre las tres, no ninguna por separado.
 *
 * - `densidad`: estrellas por cada millón de píxeles CSS de cielo. En un móvil
 *   de 390×844 se ven unas 110, 30 y 6; a 1440×900, unas 440, 120 y 25.
 * - `radio`: de cuánto a cuánto, en píxeles CSS.
 * - `brillo`: opacidad de cuánto a cuánto.
 * - `titilan`: qué parte de la capa titila. Las de fondo casi no: un fondo
 *   entero parpadeando es ruido, no un cielo.
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
    retardo: 0,
  },
  {
    clave: "medio",
    densidad: 92,
    radio: [0.6, 1.05],
    brillo: [0.45, 0.8],
    titilan: 0.4,
    retardo: 260,
  },
  {
    clave: "cerca",
    densidad: 19,
    radio: [1, 1.65],
    brillo: [0.75, 1],
    titilan: 0.7,
    retardo: 520,
  },
] as const;

export type CapaCielo = (typeof CAPAS_CIELO)[number];

/**
 * EL GIRO DEL FIRMAMENTO. El cielo gira alrededor de un polo que queda fuera
 * de la pantalla, por encima —como la estrella polar sobre el horizonte—, así
 * que las estrellas no dan vueltas sobre sí mismas: cruzan la pantalla en arco.
 *
 * - `polo`: dónde está, en proporciones de la pantalla (puede salirse).
 * - `gradosPorPantalla`: cuánto gira por cada pantalla que se baja. Poco: es
 *   un cielo que se mueve, no una rueda. En la noche de un móvil, que mide
 *   unas cuatro pantallas, da algo más de un cuarto de vuelta al cielo visible.
 */
export const GIRO_CIELO = {
  polo: [0.5, -0.45],
  gradosPorPantalla: 9,
} as const;

/**
 * EL TOPE DE ESTRELLAS POR CAPA, pase lo que pase con la pantalla. Al girar,
 * el cielo que hay que tener sembrado es el círculo que barre la pantalla
 * alrededor del polo, varias veces más grande que la pantalla; sólo se pintan
 * las que caen dentro. A partir de aquí no se ve más cielo, sólo se gasta.
 */
export const MAXIMO_ESTRELLAS_POR_CAPA = 2400;

/**
 * CUÁNDO SE APAGAN AL AMANECER. Las estrellas se van apagando según se acerca
 * el horizonte —la franja del amanecer— y por debajo de él no queda ninguna.
 * `pantallas` es desde cuánto antes del horizonte empiezan a apagarse, en
 * pantallas: así la última sección de la noche ya tiene menos cielo que la
 * portada, y el amanecer no llega de golpe.
 */
export const APAGADO_AL_AMANECER = { pantallas: 0.9 } as const;

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
 * LA VÍA LÁCTEA: una franja más densa de estrellas y con un velo de luz, que
 * gira con el resto del cielo. Se mide en «radios del cielo» desde el polo —1
 * es lo que hay del polo a la esquina más lejana de la pantalla, así que vale
 * igual en un móvil que en un monitor—: pasa por `centro`, que cae en medio de
 * la pantalla al llegar, en la dirección de `direccion`, de abajo a la
 * izquierda a arriba a la derecha. `refuerzo` es cuántas estrellas de fondo
 * más caben dentro de la franja que fuera.
 */
export const VIA_LACTEA = {
  centro: [0, 0.62],
  direccion: [1, -0.7],
  anchura: 0.16,
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
 * QUÉ SE CUENTA DE NOCHE. La historia de los novios se cuenta bajo las
 * estrellas: la portada, el paisaje, la cuenta atrás, la historia y la
 * galería. Todo lo demás —el día, la víspera, lo que ponerse, la música— es de
 * día. El orden dentro de cada tramo lo sigue poniendo la base de datos.
 */
export const SECCIONES_DE_NOCHE = [
  "portada",
  "paisaje",
  "cuenta_atras",
  "historia",
  "galeria",
] as const satisfies readonly Seccion[];

/**
 * CON QUÉ ACABA LA PÁGINA, y en este orden: dónde dormir, cómo llegar —con el
 * mapa del sitio y la estrella que se posa en él—, los regalos y, lo último,
 * la confirmación: vuestra estrella, que se toca para confirmar. Van siempre
 * al final, pongan lo que pongan en el panel: lo que hay que hacer va junto, y
 * la página acaba en lo único que falta.
 */
export const SECCIONES_DE_LLEGADA = [
  "alojamiento",
  "transporte",
  "regalos",
  "rsvp",
] as const satisfies readonly Seccion[];

/**
 * VUESTRA ESTRELLA, en el lienzo de 100 de su dibujo: el anillo hueco, su
 * grosor y el de la onda que sale de él y se apaga al crecer, como un latido
 * (`--escala-latido-estrella`; el svg deja que se salga).
 */
export const RADIO_VUESTRA_ESTRELLA = { anillo: 22, grosor: 2.5, onda: 1.5 } as const;

/**
 * LA ESTRELLA QUE BAJA AL LUGAR, en el lienzo de 100 de su dibujo: una
 * estrella de cuatro puntas —la de los mapas antiguos para marcar un sitio—,
 * con las puntas largas (`radio`) y la cintura estrecha (`cintura`), y un
 * halo alrededor (`halo`) que brilla en el centro `brilloHalo` y se apaga
 * hacia fuera.
 */
export const ESTRELLA_LLEGADA = { radio: 30, cintura: 7, halo: 46, brilloHalo: 0.55 } as const;

/**
 * CUÁNDO BAJA LA ESTRELLA: cuando el sitio del mapa sube por encima del
 * último tercio de la pantalla, como margen de un `IntersectionObserver`. Antes
 * se perdería la caída por abajo; mucho después, ya se habría pasado de largo.
 */
export const LINEA_DE_LLEGADA = "0px 0px -30% 0px";
