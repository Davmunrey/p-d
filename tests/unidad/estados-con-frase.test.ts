import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * NINGÚN ESTADO SE QUEDA SIN FRASE
 *
 * Cada módulo del panel declara los resultados de sus acciones como una unión
 * de literales —`EstadoTareas`, `EstadoMesas`…— y su pantalla los traduce a una
 * frase en un mapa `AVISOS`. Son dos listas que dicen lo mismo en dos sitios, y
 * eso se desincroniza solo: se añade un estado nuevo a la unión, la acción
 * redirige con él, TypeScript da el visto bueno porque el mapa está tipado como
 * `Record<string, …>` — y la pantalla no enseña nada. La acción falló y el
 * usuario ve la misma página de antes, sin una palabra.
 *
 * Es justo el fallo que no da error. Así que se comprueba a mano: todo estado
 * declarado tiene que aparecer, literalmente, en algún fichero de su carpeta.
 *
 * NO COMPRUEBA QUE LA FRASE SEA LA CORRECTA, sólo que exista. Lo segundo lo
 * miran los tests E2E de cada módulo, que leen el texto del aviso.
 */

const RAIZ = join(__dirname, "..", "..", "src", "app");

function ficheros(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const camino = join(directorio, entrada.name);
    return entrada.isDirectory() ? ficheros(camino) : [camino];
  });
}

/** Las uniones de estado viven en `estado.ts` o, si son de una sola pantalla, en `acciones.ts`. */
function unionesDeEstado(): { fichero: string; nombre: string; estados: string[] }[] {
  return ficheros(RAIZ)
    .filter((f) => /(?:^|\/)estado\.ts$/.test(f) || /(?:^|\/)acciones\.ts$/.test(f))
    .sort()
    .flatMap((fichero) => {
      const fuente = readFileSync(fichero, "utf8");
      const union = fuente.match(/(?:export )?type\s+(Estado\w*)\s*=\s*([\s\S]*?);/);
      if (!union) return [];
      const estados = [...union[2].matchAll(/"([^"]+)"/g)].map(
        (coincidencia) => coincidencia[1],
      );
      return estados.length ? [{ fichero, nombre: union[1], estados }] : [];
    });
}

/** Un estado está cubierto si alguien de su carpeta lo nombra: `"foo"` o `foo:`. */
function sinFrase(fichero: string, estados: string[]): string[] {
  const carpeta = dirname(fichero);
  const vecinos = readdirSync(carpeta)
    .filter((nombre) => /\.tsx?$/.test(nombre))
    .map((nombre) => readFileSync(join(carpeta, nombre), "utf8"))
    .join("\n");

  return estados.filter((estado) => {
    const escapado = estado.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const entrecomillado = new RegExp(`"${escapado}"`);
    const comoClave = new RegExp(`(^|[\\s{,])${escapado}\\s*:`, "m");
    return !entrecomillado.test(vecinos) && !comoClave.test(vecinos);
  });
}

describe("los estados de las acciones del panel", () => {
  const uniones = unionesDeEstado();

  it("hay uniones que revisar: si esto baja, es que el barrido dejó de encontrarlas", () => {
    expect(uniones.length).toBeGreaterThanOrEqual(14);
  });

  for (const union of uniones) {
    const corto = relative(RAIZ, union.fichero);

    it(`${corto} · ${union.nombre}: todos tienen frase en su pantalla`, () => {
      expect(sinFrase(union.fichero, union.estados)).toEqual([]);
    });
  }

  it("detecta de verdad un estado sin frase", () => {
    // Sin esta comprobación el test de arriba pasaría aunque el barrido
    // estuviera roto y no mirara nada.
    const inventado = "estado-que-no-existe-en-ninguna-pantalla";
    expect(sinFrase(uniones[0].fichero, [inventado])).toEqual([inventado]);
  });
});
