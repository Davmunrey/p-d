import {
  PESO_MAXIMO_IMAGEN_MB,
  PESO_MAXIMO_VIDEO_MB,
  TIPOS_MEDIO_ADMITIDOS,
} from "@/config/constants";

/**
 * BODA-29 · LO QUE SE DECIDE ANTES DE TOCAR NADA
 *
 * Aceptar un fichero y componer dónde va a vivir son dos decisiones con muchas
 * esquinas —tipos, topes, extensiones, colisiones de nombre, rutas que se
 * escapan de su carpeta— y ninguna necesita ni base de datos ni Storage para
 * comprobarse. Viven aquí, en un módulo puro, y por eso sus bordes se prueban
 * con unitarios en lugar de montando una subida entera por cada caso raro.
 *
 * FUERA DE `server-only` A PROPÓSITO, igual que `desvios.ts`: el formulario del
 * panel tiene que poder decir «esa foto pesa demasiado» ANTES de mandar veinte
 * megas por una línea móvil, y la acción de servidor tiene que volver a
 * decirlo. Es la MISMA función en los dos sitios — que es lo que impide que el
 * navegador acepte algo que el servidor rechaza.
 */

/** Un mega, en bytes. Los topes se piensan en megas y se comprueban en bytes. */
const BYTES_POR_MEGA = 1024 * 1024;

export type TipoMedio = "imagen" | "video";

/**
 * Qué extensión le corresponde a cada tipo admitido.
 *
 * SE MIRA EL TIPO DECLARADO, NO EL NOMBRE DEL FICHERO. Alguien sube «foto.jpg»
 * que en realidad es un PNG, o «vídeo.MOV» que por dentro es MP4 — pasa
 * constantemente, y más desde un móvil. La extensión que se guarda sale de
 * aquí, no de lo que trajera el fichero: así la ruta describe lo que hay dentro.
 */
const EXTENSIONES: Record<(typeof TIPOS_MEDIO_ADMITIDOS)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
};

export type MotivoRechazo = "tipo" | "peso";

export type Veredicto =
  | { admitido: true; tipo: TipoMedio; extension: string }
  | { admitido: false; motivo: MotivoRechazo; topeMb: number };

function esTipoAdmitido(tipo: string): tipo is (typeof TIPOS_MEDIO_ADMITIDOS)[number] {
  return (TIPOS_MEDIO_ADMITIDOS as readonly string[]).includes(tipo);
}

/** Un vídeo puede pesar más que una foto, y son dos topes distintos. */
export function topeEnMegas(tipo: TipoMedio): number {
  return tipo === "video" ? PESO_MAXIMO_VIDEO_MB : PESO_MAXIMO_IMAGEN_MB;
}

/**
 * ¿Se admite este fichero?
 *
 * EL TIPO SE MIRA ANTES QUE EL PESO, y el orden importa para el mensaje: a
 * quien intenta subir un PDF de treinta megas hay que decirle que los PDF no
 * valen, no que se ha pasado de peso — porque comprimirlo no le va a servir de
 * nada y va a intentarlo igualmente.
 */
export function admitirFichero(fichero: { type: string; size: number }): Veredicto {
  if (!esTipoAdmitido(fichero.type)) {
    return { admitido: false, motivo: "tipo", topeMb: 0 };
  }

  const tipo: TipoMedio = fichero.type.startsWith("video/") ? "video" : "imagen";
  const tope = topeEnMegas(tipo);

  if (fichero.size > tope * BYTES_POR_MEGA) {
    return { admitido: false, motivo: "peso", topeMb: tope };
  }

  return { admitido: true, tipo, extension: EXTENSIONES[fichero.type] };
}

/**
 * DÓNDE VA A VIVIR EL FICHERO.
 *
 * `<seccion>/<algo-aleatorio>.<ext>`, y las tres partes tienen su motivo:
 *
 *   · LA SECCIÓN DELANTE porque es como se ordena el bucket y como se mira
 *     desde fuera qué hay subido para cada trozo de la web.
 *   · UN IDENTIFICADOR ALEATORIO Y NO EL NOMBRE ORIGINAL. Dos motivos: dos
 *     personas suben «IMG_1234.jpg» el mismo día y una pisa a la otra; y el
 *     bucket es público, así que un nombre adivinable deja ver un borrador a
 *     quien pruebe rutas. «portada/foto-novios.jpg» se acierta a la primera.
 *   · LA EXTENSIÓN DEL TIPO REAL, no la que trajera el fichero.
 *
 * El nombre original no se pierde: va al texto alternativo y a la fila, que es
 * donde sirve de algo. En la ruta sólo estorbaría.
 *
 * LA SECCIÓN VA TAL CUAL, sin transformar. La base valida cada ruta contra
 * `es_ruta_almacenamiento_valida`, y su patrón
 * —`^[A-Za-z0-9][A-Za-z0-9._/-]{2,254}$`— admite el guion bajo, así que
 * `reserva_la_fecha/…` entra sin problema; comprobado ejecutando la función
 * contra la base, no leyendo el patrón. `tests/unidad/medios.test.ts` recorre
 * todas las secciones contra ese mismo patrón para que siga siendo cierto el
 * día que se añada una con un carácter raro.
 */
export function componerRuta(seccion: string, extension: string, azar: string): string {
  return `${seccion}/${azar}.${extension}`;
}

/**
 * Un identificador de ruta, sin depender de que exista `crypto.randomUUID`.
 *
 * Se le pasa la fuente de azar en lugar de tomarla de dentro: una función que
 * llama sola a `Math.random()` no se puede probar, y aquí lo que hay que
 * asegurar es la FORMA de la ruta, no que el azar sea azaroso.
 */
export function identificadorDeRuta(azar: number): string {
  return Math.floor(azar * 36 ** 12)
    .toString(36)
    .padStart(12, "0");
}
