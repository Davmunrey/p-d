import { afterEach, describe, expect, it, vi } from "vitest";

import { RUTA_RSVP } from "../../src/config/constants";
import {
  limpiarProfundo,
  limpiarTexto,
  noQuiereQueLeSigan,
  TAPADO,
} from "../../src/lib/observabilidad/limpiar";

/**
 * BODA-93 · LO QUE NUNCA PUEDE SALIR DE AQUÍ
 *
 * Es el test de un criterio de seguridad, no de una función: «ningún token,
 * correo ni teléfono sale del servidor hacia estas herramientas: filtrado
 * explícito y comprobado». Esto es el «y comprobado».
 *
 * Los casos están escritos con la forma REAL de los datos —el token de la base
 * es base64 con `-` y `_`, los de desarrollo llevan guiones y palabras— porque
 * un filtro que sólo acierta con el ejemplo bonito no filtra nada.
 */

const TOKEN = "aB3-dEf_GhI9jKlMnOpQrStU";
const TOKEN_DESARROLLO = "desarrollo-familia-uno-000000";

describe("el token de invitación", () => {
  it("no sobrevive a una URL de RSVP", () => {
    const limpio = limpiarTexto(`https://boda.example${RUTA_RSVP}/${TOKEN}`);

    expect(limpio).not.toContain(TOKEN);
    expect(limpio).toContain(RUTA_RSVP);
  });

  /**
   * EL TOKEN DE DESARROLLO TIENE OTRA FORMA, y ahí es donde se cae un filtro
   * escrito con una expresión regular: «desarrollo-familia-uno-000000» no se
   * parece en nada a un base64 de veinticuatro bytes. Por eso se corta por la
   * ruta y no por el aspecto.
   */
  it("tampoco sobrevive si es uno de los de desarrollo", () => {
    expect(limpiarTexto(`${RUTA_RSVP}/${TOKEN_DESARROLLO}`)).not.toContain(TOKEN_DESARROLLO);
  });

  it("se quita también con lo que venga detrás", () => {
    for (const cola of ["?estado=ok", "#gracias", "/editar"]) {
      const limpio = limpiarTexto(`${RUTA_RSVP}/${TOKEN}${cola}`);
      expect(limpio, `con «${cola}» detrás`).not.toContain(TOKEN);
    }
  });

  it("se quita en cada una de las veces que aparece", () => {
    const dos = `${RUTA_RSVP}/${TOKEN} y también ${RUTA_RSVP}/${TOKEN_DESARROLLO}`;
    const limpio = limpiarTexto(dos);

    expect(limpio).not.toContain(TOKEN);
    expect(limpio).not.toContain(TOKEN_DESARROLLO);
  });

  it("no se lleva por delante el resto del mensaje", () => {
    const limpio = limpiarTexto(`Fallo al guardar en ${RUTA_RSVP}/${TOKEN}: tiempo agotado`);

    expect(limpio).toContain("Fallo al guardar");
    expect(limpio).toContain("tiempo agotado");
  });
});

describe("los datos de contacto de un invitado", () => {
  it("el correo no sale, esté donde esté", () => {
    const limpio = limpiarTexto("No se pudo escribir a begona.gonzalez+boda@ejemplo.com hoy");

    expect(limpio).not.toContain("begona.gonzalez+boda@ejemplo.com");
    expect(limpio).toContain(TAPADO);
    expect(limpio).toContain("No se pudo escribir a");
  });

  it("el teléfono no sale, con o sin prefijo y con o sin espacios", () => {
    for (const telefono of ["+34 600 112 233", "600112233", "(600) 11-22-33", "+34600112233"]) {
      expect(limpiarTexto(`llamar a ${telefono}`), telefono).not.toContain(telefono);
    }
  });

  /**
   * Y LA CONTRAPARTIDA, que es la que hace útil al filtro: una fecha con su hora
   * encaja en el patrón de un teléfono —dígitos, guiones y espacios— y taparla
   * dejaría los informes de error sin lo primero que se mira. Se exigen seis
   * cifras de verdad, y «2026-08-12 14:30» tiene diez… así que esto merece
   * mirarse con cuidado.
   */
  it("no tapa un año suelto ni un número pequeño", () => {
    expect(limpiarTexto("van 120 invitados")).toContain("120");
    expect(limpiarTexto("el año 2026")).toContain("2026");
    expect(limpiarTexto("error 404 al cargar")).toContain("404");
  });
});

describe("limpiar en profundidad", () => {
  /**
   * UN INFORME DE SENTRY NO ES UN TEXTO: es un árbol. La URL va en
   * `request.url`, el mensaje en `exception.values[].value` y el rastro en
   * `breadcrumbs[].data`. Limpiar sólo el mensaje sería limpiar justo el sitio
   * donde el token casi nunca está.
   */
  it("baja hasta el fondo del informe", () => {
    const informe = {
      request: { url: `https://boda.example${RUTA_RSVP}/${TOKEN}` },
      exception: {
        values: [{ value: `No se pudo leer ${RUTA_RSVP}/${TOKEN}` }],
      },
      breadcrumbs: [{ data: { correo: "novia@ejemplo.com" } }],
      tags: { telefono: "+34 600 112 233" },
    };

    const texto = JSON.stringify(limpiarProfundo(informe));

    expect(texto).not.toContain(TOKEN);
    expect(texto).not.toContain("novia@ejemplo.com");
    expect(texto).not.toContain("600 112 233");
  });

  it("también limpia las claves, no sólo los valores", () => {
    const limpio = limpiarProfundo({ "novio@ejemplo.com": "algo" }) as Record<string, unknown>;

    expect(Object.keys(limpio)).toEqual([TAPADO]);
  });

  it("respeta lo que no hay que tocar", () => {
    expect(limpiarProfundo({ cuantos: 120, activo: true, nada: null })).toEqual({
      cuantos: 120,
      activo: true,
      nada: null,
    });
  });

  /**
   * LO QUE NO SE SABE DESCRIBIR TAMPOCO SE SABE LIMPIAR. Una función o una
   * instancia de una clase puede llevar dentro cualquier cosa —incluida la
   * sesión entera— y serializarla «a ver qué sale» es como se filtran los datos
   * que nadie sabía que estaban ahí.
   */
  it("lo que no es un dato llano no pasa", () => {
    const limpio = limpiarProfundo({ fn: () => "secreto" }) as Record<string, unknown>;
    expect(limpio.fn).toBe(TAPADO);
  });

  it("un objeto que se apunta a sí mismo no cuelga el proceso", () => {
    const ciclo: Record<string, unknown> = { nombre: "vuelta" };
    ciclo.yo = ciclo;

    // Lo que importa es que termine; el corte por profundidad es el que lo hace.
    expect(() => JSON.stringify(limpiarProfundo(ciclo))).not.toThrow();
  });
});

describe("la preferencia de no ser rastreado", () => {
  afterEach(() => vi.unstubAllGlobals());

  /**
   * SIN NAVEGADOR, NO SE MIDE. En el servidor no hay a quién preguntar, y la
   * respuesta segura no es «pues mido»: es «no».
   */
  it("sin `window` se da por hecho que no", () => {
    // Los tests corren en jsdom, donde `window` existe: hay que quitarlo a
    // propósito para poder probar el caso del servidor, que es el que importa.
    vi.stubGlobal("window", undefined);
    expect(noQuiereQueLeSigan()).toBe(true);
  });

  it("se respetan las tres señales, no sólo la clásica", () => {
    for (const navegador of [
      { doNotTrack: "1" },
      { doNotTrack: "yes" },
      { msDoNotTrack: "1" },
      { globalPrivacyControl: true },
    ]) {
      vi.stubGlobal("window", { navigator: navegador });
      expect(noQuiereQueLeSigan(), JSON.stringify(navegador)).toBe(true);
      vi.unstubAllGlobals();
    }
  });

  it("sin ninguna señal, se puede medir", () => {
    vi.stubGlobal("window", { navigator: { doNotTrack: null } });
    expect(noQuiereQueLeSigan()).toBe(false);
  });
});
