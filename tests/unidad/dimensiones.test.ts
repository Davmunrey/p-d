import { describe, expect, it } from "vitest";

import { medirImagen } from "@/lib/dimensiones";

/**
 * BODA-29 · Leer el tamaño de la cabecera
 *
 * Se construyen cabeceras a mano en vez de meter ficheros de prueba en el
 * repositorio. Dos razones: un PNG de verdad son kilobytes de píxeles para
 * probar ocho, y —más importante— así se puede escribir el caso RARO. La
 * miniatura EXIF que hace que el ancho de un JPEG esté a dos mil bytes del
 * principio no sale de exportar una foto: se fabrica.
 */

/** Los ocho bytes con los que empieza todo PNG, y su cabecera IHDR. */
function png(ancho: number, alto: number): Uint8Array {
  const datos = new Uint8Array(24);
  datos.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const vista = new DataView(datos.buffer);
  vista.setUint32(16, ancho);
  vista.setUint32(20, alto);
  return datos;
}

/**
 * Un JPEG con `relleno` bytes de segmentos por delante del fotograma, para
 * imitar los datos EXIF y la miniatura que traen las fotos de un móvil.
 */
function jpeg(ancho: number, alto: number, relleno = 0, marcador = 0xc0): Uint8Array {
  const partes: number[] = [0xff, 0xd8];

  if (relleno > 0) {
    // Un segmento APP1 (EXIF) del tamaño pedido.
    partes.push(0xff, 0xe1, ((relleno + 2) >> 8) & 0xff, (relleno + 2) & 0xff);
    for (let i = 0; i < relleno; i++) partes.push(0x00);
  }

  partes.push(0xff, marcador, 0x00, 0x11, 0x08);
  partes.push((alto >> 8) & 0xff, alto & 0xff);
  partes.push((ancho >> 8) & 0xff, ancho & 0xff);
  // Cola, para que el recorrido tenga por dónde seguir si no encuentra nada.
  for (let i = 0; i < 16; i++) partes.push(0x00);

  return new Uint8Array(partes);
}

function webp(tipo: string, relleno: (datos: Uint8Array, v: DataView) => void): Uint8Array {
  const datos = new Uint8Array(40);
  const vista = new DataView(datos.buffer);
  const escribe = (texto: string, desde: number) => {
    for (let i = 0; i < texto.length; i++) datos[desde + i] = texto.charCodeAt(i);
  };
  escribe("RIFF", 0);
  escribe("WEBP", 8);
  escribe(tipo, 12);
  relleno(datos, vista);
  return datos;
}

describe("medir una imagen", () => {
  it("lee un PNG", () => {
    expect(medirImagen(png(1920, 1080))).toEqual({ ancho: 1920, alto: 1080 });
  });

  it("lee un JPEG sencillo", () => {
    expect(medirImagen(jpeg(800, 600))).toEqual({ ancho: 800, alto: 600 });
  });

  /**
   * EL CASO QUE IMPORTA DE VERDAD. Una foto de móvil trae EXIF y miniatura
   * antes del fotograma: si el recorrido no salta los segmentos por su
   * longitud, se queda mirando los primeros bytes y no encuentra nada — o peor,
   * se cree que un byte cualquiera de la miniatura es el marcador.
   */
  it("lee un JPEG con EXIF y miniatura por delante", () => {
    expect(medirImagen(jpeg(4032, 3024, 2000))).toEqual({ ancho: 4032, alto: 3024 });
  });

  /**
   * `SOF4`, `SOF8` y `SOFC` caen dentro del rango de fotogramas por su número
   * pero son tablas. Confundirlos da un tamaño leído de una tabla de Huffman.
   */
  it("no confunde las tablas con el fotograma", () => {
    for (const tabla of [0xc4, 0xc8, 0xcc]) {
      const datos = jpeg(100, 50, 0, tabla);
      expect(medirImagen(datos), `el marcador 0x${tabla.toString(16)} no es un fotograma`).toBe(
        null,
      );
    }
  });

  it("lee los tres sabores de WebP", () => {
    const conPerdida = webp("VP8 ", (_d, v) => {
      v.setUint16(26, 640, true);
      v.setUint16(28, 480, true);
    });
    expect(medirImagen(conPerdida)).toEqual({ ancho: 640, alto: 480 });

    const sinPerdida = webp("VP8L", (_d, v) => {
      // Catorce bits cada uno, guardados menos uno.
      v.setUint32(21, (639 & 0x3fff) | ((479 & 0x3fff) << 14), true);
    });
    expect(medirImagen(sinPerdida)).toEqual({ ancho: 640, alto: 480 });

    const extendido = webp("VP8X", (d) => {
      const escribeTres = (valor: number, desde: number) => {
        d[desde] = valor & 0xff;
        d[desde + 1] = (valor >> 8) & 0xff;
        d[desde + 2] = (valor >> 16) & 0xff;
      };
      escribeTres(1279, 24);
      escribeTres(719, 27);
    });
    expect(medirImagen(extendido)).toEqual({ ancho: 1280, alto: 720 });
  });

  /**
   * AVIF SE ADMITE PERO NO SE MIDE, y eso es un resultado válido. La base
   * acepta ancho y alto vacíos; lo que no se puede es inventarse un tamaño.
   */
  it("un formato que no se sabe leer devuelve null, no un error", () => {
    const avif = new Uint8Array(32);
    avif.set([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]); // ...ftyp
    expect(medirImagen(avif)).toBe(null);
  });

  it("un fichero vacío o cortado no revienta", () => {
    expect(medirImagen(new Uint8Array(0))).toBe(null);
    expect(medirImagen(new Uint8Array([0x89, 0x50]))).toBe(null);
    expect(medirImagen(png(1920, 1080).subarray(0, 12))).toBe(null);
  });

  /**
   * Un cero no es una medida: es un fichero roto. Guardarlo dejaría un hueco
   * de altura nula, que es no reservar nada — justo lo que se quería evitar.
   */
  it("un tamaño de cero se trata como no medible", () => {
    expect(medirImagen(png(0, 1080))).toBe(null);
    expect(medirImagen(png(1920, 0))).toBe(null);
  });
});
