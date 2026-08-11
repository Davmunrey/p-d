/**
 * BODA-29 · EL ANCHO Y EL ALTO, LEÍDOS DE LA CABECERA
 *
 * Hacen falta para reservar el hueco de la foto antes de que llegue. Sin ellos
 * la página da un salto al cargar cada imagen, y en la landing eso es el
 * titular de una sección moviéndose bajo el dedo de quien iba a pulsarlo.
 *
 * NO SE LE PREGUNTAN AL NAVEGADOR. Un formulario puede mandar los números que
 * le dé la gana, y aquí no es cuestión de seguridad sino de que lo que se
 * guarda describa el fichero de verdad: si alguien sube desde una conexión que
 * corta a medias, o un fichero que se renombró, la cabecera dice la verdad y el
 * formulario repite lo que creía.
 *
 * NI SE AÑADE UNA DEPENDENCIA. Este proyecto tiene siete dependencias de
 * ejecución, y meter una librería de imágenes entera —con sus binarios por
 * plataforma— para leer dos números de una cabecera sería un mal cambio. Los
 * formatos que admitimos guardan el tamaño en los primeros bytes y leerlo es
 * esto: unas decenas de líneas que se prueban solas.
 *
 * QUÉ PASA CON AVIF: su tamaño vive dentro de una caja `ispe` del contenedor
 * ISOBMFF, varios niveles de anidamiento adentro, y sacarlo bien es un parser
 * de verdad. Se admite el formato igual y se devuelve `null`: la base acepta
 * ancho y alto vacíos —su restricción es que vayan los dos o ninguno— y lo
 * único que se pierde es el hueco reservado para ESA foto. Mentir con un tamaño
 * inventado sería peor.
 */

export interface Dimensiones {
  ancho: number;
  alto: number;
}

/** Los ocho bytes con los que empieza todo PNG. */
const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function empiezaCon(datos: Uint8Array, firma: readonly number[], desde = 0): boolean {
  return firma.every((byte, i) => datos[desde + i] === byte);
}

function texto(datos: Uint8Array, desde: number, largo: number): string {
  return String.fromCharCode(...datos.subarray(desde, desde + largo));
}

/**
 * PNG · el tamaño está siempre en el mismo sitio.
 *
 * La cabecera `IHDR` es obligatoria y va la primera, así que el ancho son
 * cuatro bytes en la posición 16 y el alto los cuatro siguientes. Sin buscar
 * nada.
 */
function dePng(datos: Uint8Array): Dimensiones | null {
  if (datos.length < 24 || !empiezaCon(datos, FIRMA_PNG)) return null;

  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  return { ancho: vista.getUint32(16), alto: vista.getUint32(20) };
}

/**
 * JPEG · hay que buscarlo, y esquivar trampas.
 *
 * El fichero es una ristra de segmentos y el tamaño vive en el marcador «de
 * inicio de fotograma» (`SOF`), que puede estar detrás de miles de bytes de
 * miniatura y datos EXIF. Se recorren los segmentos saltando por su longitud.
 *
 * DOS MARCADORES NO LLEVAN LONGITUD y saltarlos con la regla general se lleva
 * el parser por delante: `SOI` (inicio) y los de reinicio. Y `SOF4`, `SOF8` y
 * `SOFC` no son fotogramas aunque lo parezcan por el nombre — son tablas.
 */
function deJpeg(datos: Uint8Array): Dimensiones | null {
  if (datos.length < 4 || datos[0] !== 0xff || datos[1] !== 0xd8) return null;

  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  let i = 2;

  while (i + 9 < datos.length) {
    if (datos[i] !== 0xff) {
      i += 1;
      continue;
    }

    const marcador = datos[i + 1];

    // Relleno entre segmentos: se escribe con 0xFF repetido.
    if (marcador === 0xff) {
      i += 1;
      continue;
    }

    // `SOF0`..`SOFF` son fotogramas, MENOS estos tres, que son tablas.
    const esFotograma =
      marcador >= 0xc0 &&
      marcador <= 0xcf &&
      marcador !== 0xc4 &&
      marcador !== 0xc8 &&
      marcador !== 0xcc;

    if (esFotograma) {
      // Tras el marcador: longitud (2), precisión (1), alto (2), ancho (2).
      return { alto: vista.getUint16(i + 5), ancho: vista.getUint16(i + 7) };
    }

    const longitud = vista.getUint16(i + 2);
    if (longitud < 2) return null;
    i += 2 + longitud;
  }

  return null;
}

/**
 * WebP · tres formatos distintos bajo el mismo nombre.
 *
 * `VP8 ` es con pérdida, `VP8L` sin pérdida y `VP8X` el extendido —el que
 * llevan los animados y los que tienen transparencia—. Cada uno guarda el
 * tamaño en un sitio y con una codificación distinta, y los tres son WebP
 * legítimos que sale de cualquier exportador.
 */
function deWebp(datos: Uint8Array): Dimensiones | null {
  if (datos.length < 30) return null;
  if (texto(datos, 0, 4) !== "RIFF" || texto(datos, 8, 4) !== "WEBP") return null;

  const tipo = texto(datos, 12, 4);
  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);

  if (tipo === "VP8 ") {
    // Los 14 bits bajos de cada valor; los dos altos son la escala.
    return {
      ancho: vista.getUint16(26, true) & 0x3fff,
      alto: vista.getUint16(28, true) & 0x3fff,
    };
  }

  if (tipo === "VP8L") {
    // Catorce bits para cada uno, empaquetados sin respetar bytes.
    const bits = vista.getUint32(21, true);
    return {
      ancho: (bits & 0x3fff) + 1,
      alto: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  if (tipo === "VP8X") {
    // Aquí van menos uno y en tres bytes, en orden inverso.
    const leerTres = (desde: number) =>
      datos[desde] | (datos[desde + 1] << 8) | (datos[desde + 2] << 16);
    return { ancho: leerTres(24) + 1, alto: leerTres(27) + 1 };
  }

  return null;
}

/**
 * Lee el tamaño de la cabecera. `null` si el formato no se sabe leer — que es
 * un resultado válido y no un fallo: la base admite ancho y alto vacíos.
 *
 * Se le pasan los primeros bytes, no el fichero entero: con la cabecera basta y
 * así no hay que traerse un vídeo de cincuenta megas a memoria para saber que
 * no se puede medir.
 */
export function medirImagen(datos: Uint8Array): Dimensiones | null {
  const medida = dePng(datos) ?? deJpeg(datos) ?? deWebp(datos);

  if (!medida) return null;

  // Un cero no es una medida: es un fichero roto o un parser equivocado, y
  // guardarlo dejaría un hueco de altura nula que no reserva nada.
  if (!Number.isFinite(medida.ancho) || !Number.isFinite(medida.alto)) return null;
  if (medida.ancho <= 0 || medida.alto <= 0) return null;

  return medida;
}
