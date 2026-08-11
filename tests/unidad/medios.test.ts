import { describe, expect, it } from "vitest";

import {
  PESO_MAXIMO_IMAGEN_MB,
  PESO_MAXIMO_VIDEO_MB,
  TIPOS_MEDIO_ADMITIDOS,
} from "@/config/constants";
import { admitirFichero, componerRuta, identificadorDeRuta, topeEnMegas } from "@/lib/medios";

/**
 * BODA-29 · Los bordes de admitir un fichero
 *
 * Se prueba aquí y no con un E2E porque son bordes: el byte de más, el tipo
 * que se parece pero no es, el vídeo que cabría siendo imagen y no al revés.
 * Montar una subida entera por cada uno costaría minutos de CI y probaría lo
 * mismo peor.
 */

const MEGA = 1024 * 1024;

describe("admitir un fichero", () => {
  it("admite todos los tipos que declara la configuración", () => {
    for (const tipo of TIPOS_MEDIO_ADMITIDOS) {
      const veredicto = admitirFichero({ type: tipo, size: MEGA });
      expect(veredicto.admitido, `${tipo} debería admitirse`).toBe(true);
    }
  });

  it("rechaza lo que no está en la lista", () => {
    for (const tipo of ["application/pdf", "image/gif", "video/quicktime", "text/html"]) {
      const veredicto = admitirFichero({ type: tipo, size: 1000 });
      expect(veredicto.admitido, `${tipo} no debería admitirse`).toBe(false);
      if (!veredicto.admitido) expect(veredicto.motivo).toBe("tipo");
    }
  });

  /**
   * EL TIPO SE MIRA ANTES QUE EL PESO, y el orden es el mensaje: a quien sube
   * un PDF enorme hay que decirle que los PDF no valen. Si se le dice que pesa
   * demasiado, lo comprime y vuelve a intentarlo — dos veces para nada.
   */
  it("un tipo no admitido se rechaza por el tipo aunque además se pase de peso", () => {
    const veredicto = admitirFichero({
      type: "application/pdf",
      size: PESO_MAXIMO_VIDEO_MB * MEGA * 10,
    });

    expect(veredicto.admitido).toBe(false);
    if (!veredicto.admitido) expect(veredicto.motivo).toBe("tipo");
  });

  it("cada tipo tiene su tope, y el del vídeo es mayor", () => {
    expect(topeEnMegas("imagen")).toBe(PESO_MAXIMO_IMAGEN_MB);
    expect(topeEnMegas("video")).toBe(PESO_MAXIMO_VIDEO_MB);
    expect(PESO_MAXIMO_VIDEO_MB).toBeGreaterThan(PESO_MAXIMO_IMAGEN_MB);
  });

  it("el tope justo entra, y un byte más no", () => {
    const justo = admitirFichero({ type: "image/jpeg", size: PESO_MAXIMO_IMAGEN_MB * MEGA });
    expect(justo.admitido, "el tope exacto es válido, no el primero que sobra").toBe(true);

    const pasado = admitirFichero({
      type: "image/jpeg",
      size: PESO_MAXIMO_IMAGEN_MB * MEGA + 1,
    });
    expect(pasado.admitido).toBe(false);
    if (!pasado.admitido) {
      expect(pasado.motivo).toBe("peso");
      expect(pasado.topeMb, "el aviso dice cuál era el tope").toBe(PESO_MAXIMO_IMAGEN_MB);
    }
  });

  /**
   * El caso que se cuela solo: un vídeo de veinte megas cabe como vídeo y no
   * cabría como imagen. Si el tope se aplicara sin mirar el tipo, el fondo del
   * paisaje sería imposible de subir.
   */
  it("un vídeo puede pesar lo que una imagen no", () => {
    const tamano = (PESO_MAXIMO_IMAGEN_MB + 1) * MEGA;

    expect(admitirFichero({ type: "video/mp4", size: tamano }).admitido).toBe(true);
    expect(admitirFichero({ type: "image/jpeg", size: tamano }).admitido).toBe(false);
  });

  it("la extensión sale del tipo declarado, no del nombre del fichero", () => {
    // Alguien sube un PNG llamado «foto.jpg». Pasa constantemente desde el móvil.
    const veredicto = admitirFichero({ type: "image/png", size: 1000 });

    expect(veredicto.admitido).toBe(true);
    if (veredicto.admitido) {
      expect(veredicto.extension).toBe("png");
      expect(veredicto.tipo).toBe("imagen");
    }
  });

  it("distingue vídeo de imagen", () => {
    const video = admitirFichero({ type: "video/mp4", size: 1000 });
    expect(video.admitido && video.tipo).toBe("video");

    const imagen = admitirFichero({ type: "image/avif", size: 1000 });
    expect(imagen.admitido && imagen.tipo).toBe("imagen");
  });
});

describe("componer la ruta", () => {
  it("es sección, identificador y extensión", () => {
    expect(componerRuta("portada", "jpg", "abc123")).toBe("portada/abc123.jpg");
  });

  /**
   * La ruta la compone el servidor entera: la sección sale del desplegable y el
   * identificador del azar. El nombre que trajera el fichero NO entra —ni para
   * limpiarlo—, y por eso no hay nada que sanear: no hay hueco por donde meter
   * un `../`.
   */
  it("no hay ningún hueco donde colar una travesía de directorios", () => {
    const ruta = componerRuta("portada", "jpg", identificadorDeRuta(0.5));

    expect(ruta).not.toContain("..");
    expect(ruta.split("/")).toHaveLength(2);
    expect(ruta.startsWith("/"), "una ruta absoluta apuntaría fuera del bucket").toBe(false);
  });

  it("el identificador siempre tiene la misma forma", () => {
    for (const azar of [0, 0.000001, 0.5, 0.999999]) {
      const id = identificadorDeRuta(azar);
      expect(id).toHaveLength(12);
      expect(id, `«${id}» tiene que ser alfanumérico en minúsculas`).toMatch(/^[0-9a-z]{12}$/);
    }
  });

  /**
   * Dos ficheros distintos no pueden acabar en la misma ruta: el segundo
   * pisaría al primero y una foto publicada cambiaría sola.
   */
  it("dos azares distintos dan rutas distintas", () => {
    expect(identificadorDeRuta(0.1)).not.toBe(identificadorDeRuta(0.2));
  });
});
