import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONSTELACIONES,
  CONSTELACION_NOVIOS,
  constelacionPorClave,
  GROSOR_TRAZO,
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

  it("los dos semánticos existen en los cuatro fondos del sistema", () => {
    const semanticos = readFileSync(
      join(RAIZ, "src", "styles", "tokens", "semantic.css"),
      "utf8",
    );

    // Claro, oscuro por preferencia, oscuro forzado, bloque inverso y pie.
    const apariciones = semanticos.match(/--constelacion-estrella:/g) ?? [];
    expect(apariciones.length).toBe(5);
    expect(semanticos.match(/--constelacion-trazo:/g)?.length).toBe(5);

    // Y sólo referencian primitivos: la capa 2 no inventa valores.
    for (const linea of semanticos.split("\n")) {
      if (linea.includes("--constelacion-")) {
        expect(linea, `capa 2 con literal: ${linea.trim()}`).toMatch(/var\(--color-/);
      }
    }
  });
});
