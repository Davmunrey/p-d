import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { renderToStaticMarkup } from "react-dom/server";

import { Constelacion } from "@/components/ui/constelacion";
import {
  CONSTELACIONES,
  CONSTELACION_NOVIOS,
  constelacionPorClave,
  ESCALA_ESTRELLA_TARJETA,
  GROSOR_TRAZO,
  normalizarClave,
} from "@/config/constelaciones";

/**
 * LAS CONSTELACIONES
 *
 * Son ciento y pico números transcritos de la entrega, y ese es exactamente el
 * tipo de dato donde un dedazo no se nota: una estrella movida tres unidades
 * sigue pareciendo una constelación. Por eso lo que se comprueba aquí no es
 * «que estén», sino las invariantes que romperían el dibujo de verdad.
 */

const RAIZ = join(__dirname, "..", "..");

describe("El catálogo de constelaciones", () => {
  it("tiene las dieciséis de la entrega, ocho por hemisferio", () => {
    expect(CONSTELACIONES).toHaveLength(16);
    expect(CONSTELACIONES.filter((c) => c.hemisferio === "norte")).toHaveLength(8);
    expect(CONSTELACIONES.filter((c) => c.hemisferio === "sur")).toHaveLength(8);
  });

  it("no repite ninguna clave", () => {
    const claves = CONSTELACIONES.map((c) => c.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  /**
   * CASO DE ERROR. El fallo silencioso de este dato: una línea que apunta a una
   * estrella que no existe. React pintaría `x1={undefined}` y la línea
   * sencillamente no saldría, sin un solo error en consola.
   */
  it("cada línea une dos estrellas que existen", () => {
    for (const { clave, estrellas, lineas } of CONSTELACIONES) {
      for (const [desde, hasta] of lineas) {
        expect(
          estrellas[desde],
          `${clave}: la línea sale de la estrella ${desde}`,
        ).toBeDefined();
        expect(
          estrellas[hasta],
          `${clave}: la línea llega a la estrella ${hasta}`,
        ).toBeDefined();
        // Una línea de una estrella a sí misma es un punto: no dibuja nada.
        expect(desde, `${clave}: línea de una estrella a sí misma`).not.toBe(hasta);
      }
    }
  });

  it("ninguna estrella se sale del lienzo", () => {
    for (const { clave, estrellas } of CONSTELACIONES) {
      for (const [x, y, radio] of estrellas) {
        // El radio cuenta: una estrella en x=100 con r=1.8 saldría cortada.
        expect(x - radio, `${clave}: estrella cortada por la izquierda`).toBeGreaterThanOrEqual(
          0,
        );
        expect(x + radio, `${clave}: estrella cortada por la derecha`).toBeLessThanOrEqual(100);
        expect(y - radio, `${clave}: estrella cortada por arriba`).toBeGreaterThanOrEqual(0);
        expect(y + radio, `${clave}: estrella cortada por abajo`).toBeLessThanOrEqual(100);
        expect(radio, `${clave}: estrella sin brillo`).toBeGreaterThan(0);
      }
    }
  });

  it("ninguna constelación se queda con estrellas sueltas", () => {
    // Una estrella que no toca ninguna línea es un punto perdido en el mapa:
    // o falta una línea, o sobra la estrella.
    for (const { clave, estrellas, lineas } of CONSTELACIONES) {
      const unidas = new Set(lineas.flat());
      for (let i = 0; i < estrellas.length; i++) {
        expect(unidas.has(i), `${clave}: la estrella ${i} no une con ninguna otra`).toBe(true);
      }
    }
  });

  it("la constelación de los novios existe y es del norte", () => {
    const novios = constelacionPorClave(CONSTELACION_NOVIOS);
    expect(novios).toBeDefined();
    // Vega, la más brillante del verano boreal: es el cielo de esa noche.
    expect(novios?.hemisferio).toBe("norte");
  });

  it("una clave que no existe devuelve nada, no revienta", () => {
    expect(constelacionPorClave("perro")).toBeUndefined();
  });

  /**
   * BODA-122 · LA CLAVE SE NORMALIZA, COMO EN EL COMPONENTE DE LA ENTREGA.
   *
   * «Osa Mayor» con su espacio y su mayúscula es como lo va a escribir quien
   * ponga nombre a una mesa; «osamayor» es como está guardado. Compararlos tal
   * cual dejaba la mesa sin dibujo y sin error.
   */
  it.each([
    ["Osa Mayor", "osamayor"],
    ["osa-mayor", "osamayor"],
    ["Águila", "aguila"],
    ["CORONA BOREAL", "coronaboreal"],
    ["Fénix", "fenix"],
  ])("«%s» se entiende como «%s»", (escrita, clave) => {
    expect(normalizarClave(escrita)).toBe(clave);
    expect(constelacionPorClave(escrita)?.clave).toBe(clave);
  });

  it("la escala de la tarjeta agranda las estrellas sin sacar ninguna del lienzo", () => {
    expect(ESCALA_ESTRELLA_TARJETA).toBeGreaterThan(1);
    for (const { clave, estrellas } of CONSTELACIONES) {
      for (const [x, y, radio] of estrellas) {
        const r = radio * ESCALA_ESTRELLA_TARJETA;
        expect(x - r, `${clave}: a 1.2× se corta por la izquierda`).toBeGreaterThanOrEqual(0);
        expect(x + r, `${clave}: a 1.2× se corta por la derecha`).toBeLessThanOrEqual(100);
        expect(y - r, `${clave}: a 1.2× se corta por arriba`).toBeGreaterThanOrEqual(0);
        expect(y + r, `${clave}: a 1.2× se corta por abajo`).toBeLessThanOrEqual(100);
      }
    }
  });
});

/**
 * BODA-122 · Lo que el componente hace con lo que le llega.
 */
describe("El componente Constelacion", () => {
  const lira = constelacionPorClave(CONSTELACION_NOVIOS)!;

  it("con una clave desconocida pinta la Lira en vez de callarse", () => {
    // CASO DE ERROR. Una letra de más en la clave de un marcasitios no puede
    // dejar la pieza sin su adorno: es lo que hace el componente de la
    // entrega, y nadie ve un hueco vacío en una impresión hasta que es tarde.
    const html = renderToStaticMarkup(<Constelacion clave="perro" />);
    expect(html.match(/<circle/g)?.length).toBe(lira.estrellas.length);
    expect(html.match(/<line/g)?.length).toBe(lira.lineas.length);
  });

  it("acepta la clave con acentos y espacios", () => {
    const aguila = constelacionPorClave("aguila")!;
    const html = renderToStaticMarkup(<Constelacion clave="Águila" rotulada />);
    expect(html).toContain(`<title id="constelacion-aguila">${aguila.nombre}</title>`);
  });

  it("la escala multiplica el radio de cada estrella y sólo el radio", () => {
    const html = renderToStaticMarkup(
      <Constelacion clave={CONSTELACION_NOVIOS} escala={ESCALA_ESTRELLA_TARJETA} />,
    );
    const [, , radio] = lira.estrellas[0];
    expect(html).toContain(`r="${radio * ESCALA_ESTRELLA_TARJETA}"`);
    // Las coordenadas no se tocan: crece el brillo, no el mapa.
    expect(html).toContain(`cx="${lira.estrellas[0][0]}"`);
  });

  it("el svg desborda a la vista para que una estrella al borde no se corte", () => {
    const html = renderToStaticMarkup(<Constelacion clave={CONSTELACION_NOVIOS} />);
    expect(html).toContain("overflow-visible");
  });
});

/**
 * REGLA 1 · Ni el dibujo ni sus colores pueden estar escritos en el componente.
 */
describe("Las constelaciones respetan el sistema de tokens", () => {
  const componente = readFileSync(
    join(RAIZ, "src", "components", "ui", "constelacion.tsx"),
    "utf8",
  );

  it("el componente no escribe ni un color", () => {
    // Ni hex, ni rgb(), ni nombres de color sueltos en atributos de SVG.
    expect(componente).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(componente).not.toMatch(/\brgba?\(/);
    expect(componente).toContain("fill-constelacion-estrella");
    expect(componente).toContain("stroke-constelacion-trazo");
  });

  it("el grosor del trazo sale de la configuración, no del componente", () => {
    expect(componente).toContain("GROSOR_TRAZO");
    expect(GROSOR_TRAZO).toBeGreaterThan(0);
  });

  it("los dos semánticos existen en los tres fondos del sistema", () => {
    const semanticos = readFileSync(
      join(RAIZ, "src", "styles", "tokens", "semantic.css"),
      "utf8",
    );

    /*
      Claro, bloque inverso y pie. Eran cinco cuando existía el tema oscuro —que
      aportaba dos: el de preferencia del sistema y el forzado—; al quitarlo se
      quedan los tres fondos que de verdad tiene la entrega. Una constelación
      sobre marino con el trazo de fondo claro es invisible, así que cada fondo
      nuevo obliga a reasignar los dos tokens, y este número es el recordatorio.
    */
    const apariciones = semanticos.match(/--constelacion-estrella:/g) ?? [];
    expect(apariciones.length).toBe(3);
    expect(semanticos.match(/--constelacion-trazo:/g)?.length).toBe(3);

    // Y sólo referencian primitivos: la capa 2 no inventa valores.
    for (const linea of semanticos.split("\n")) {
      if (linea.includes("--constelacion-")) {
        expect(linea, `capa 2 con literal: ${linea.trim()}`).toMatch(/var\(--color-/);
      }
    }
  });
});
