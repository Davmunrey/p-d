import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MODULOS, MODULOS_ENTREGADOS, moduloActivo } from "../../src/config/modulos";
import { RUTA_PANEL } from "../../src/config/constants";
import copy from "../../content/copy.es.json";

/**
 * EL MENÚ NO PUEDE PROMETER LO QUE NO HAY
 *
 * `entregado: true` es lo único que separa un módulo de aparecer en la
 * navegación. Es una palabra, se cambia en un segundo y es facilísimo
 * cambiarla de más —al empezar el ticket en lugar de al acabarlo— y no
 * enterarse hasta que alguien pincha y encuentra un 404.
 *
 * Estas comprobaciones son baratas y cierran esa puerta: marcar un módulo como
 * terminado sin su página pone el CI en rojo.
 */

const RAIZ_APP = join(process.cwd(), "src/app");

/** `/panel/cuenta` → `src/app/panel/cuenta/page.tsx` */
function ficheroDe(ruta: string): string {
  return join(RAIZ_APP, ruta, "page.tsx");
}

describe("Módulos del panel", () => {
  it("todo lo marcado como entregado tiene su página", () => {
    const sinPagina = MODULOS_ENTREGADOS.filter(
      (modulo) => !existsSync(ficheroDe(modulo.ruta)),
    );

    expect(sinPagina.map((modulo) => modulo.clave)).toEqual([]);
  });

  it("lo que no está entregado tampoco tiene página suelta por ahí", () => {
    // El caso contrario: una pantalla terminada que nadie ve porque se olvidó
    // el `true`. Trabajo hecho y escondido.
    const olvidados = MODULOS.filter(
      (modulo) => !modulo.entregado && existsSync(ficheroDe(modulo.ruta)),
    );

    expect(olvidados.map((modulo) => modulo.clave)).toEqual([]);
  });

  it("cada módulo tiene su rótulo en castellano", () => {
    for (const modulo of MODULOS) {
      expect(copy.panel.modulos, `falta el rótulo de "${modulo.clave}"`).toHaveProperty(
        modulo.clave,
      );
    }
  });

  it("no hay dos módulos en la misma ruta", () => {
    const rutas = MODULOS.map((modulo) => modulo.ruta);
    expect(new Set(rutas).size).toBe(rutas.length);
  });

  it("todos cuelgan del panel", () => {
    for (const modulo of MODULOS) {
      expect(modulo.ruta === RUTA_PANEL || modulo.ruta.startsWith(`${RUTA_PANEL}/`)).toBe(true);
    }
  });
});

describe("Qué módulo está activo", () => {
  it("una ruta interna no se marca como el resumen", () => {
    // `/panel` encaja con todo lo que cuelga de él. Sin buscar la coincidencia
    // más larga, el menú señalaría siempre «Resumen» y dejaría de decir dónde
    // está uno, que es su único trabajo.
    expect(moduloActivo("/panel/cuenta")).toBe("cuenta");
    expect(moduloActivo("/panel")).toBe("resumen");
  });

  it("una subruta hereda el módulo de su padre", () => {
    expect(moduloActivo("/panel/cuenta/lo-que-venga")).toBe("cuenta");
  });

  it("lo que no es de nadie no marca nada", () => {
    expect(moduloActivo("/acceso")).toBeNull();

    /*
      Un módulo sin entregar no puede salir marcado: no está en el menú.

      El ejemplo se saca de la propia lista en lugar de escribir una ruta a
      mano. Antes ponía `/panel/invitados`, y el día que invitados se entregó
      este test se cayó — no porque la regla dejara de valer, sino porque el
      ejemplo había caducado. Así el test envejece solo.
    */
    const sinEntregar = MODULOS.find((modulo) => !modulo.entregado);
    if (sinEntregar) expect(moduloActivo(sinEntregar.ruta)).toBeNull();
  });
});
