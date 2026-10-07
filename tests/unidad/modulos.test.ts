import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GRUPOS_DE_MODULOS,
  MODULOS,
  MODULOS_EN_LA_BARRA,
  MODULOS_ENTREGADOS,
  PESTANAS,
  moduloActivo,
  modulosDe,
  pestanaActiva,
} from "../../src/config/modulos";
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

describe("Los grupos del menú y la barra del móvil", () => {
  it("cada grupo tiene al menos un módulo entregado y su rótulo", () => {
    for (const grupo of GRUPOS_DE_MODULOS) {
      expect(modulosDe(grupo).length, `el grupo «${grupo}» se pintaría vacío`).toBeGreaterThan(
        0,
      );
      expect(copy.panel.grupos).toHaveProperty(grupo);
    }
  });

  it("todo módulo entregado está en algún sitio del menú, y en uno solo", () => {
    const pintados = (["inicio", ...GRUPOS_DE_MODULOS, "pie"] as const).flatMap((lugar) =>
      modulosDe(lugar).map((modulo) => modulo.clave),
    );
    expect([...pintados].sort()).toEqual(
      MODULOS_ENTREGADOS.map((modulo) => modulo.clave).sort(),
    );
  });

  it("la barra del móvil sólo lleva módulos entregados, cada uno con su rótulo corto", () => {
    // Con «Más» son cinco huecos: más no caben a 390 px con icono y rótulo.
    expect(MODULOS_EN_LA_BARRA.length).toBeLessThanOrEqual(4);
    for (const clave of MODULOS_EN_LA_BARRA) {
      expect(MODULOS_ENTREGADOS.some((modulo) => modulo.clave === clave)).toBe(true);
      expect(copy.panel.barra).toHaveProperty(clave);
    }
  });
});

/**
 * Página propia o, si no, la de un segmento dinámico hermano: las listas de
 * contenido son `/panel/contenido/[lista]`, una sola página para las seis.
 */
function tienePagina(ruta: string): boolean {
  if (existsSync(ficheroDe(ruta))) return true;
  const padre = dirname(join(RAIZ_APP, ruta));
  return (
    existsSync(padre) &&
    readdirSync(padre).some(
      (entrada) => entrada.startsWith("[") && existsSync(join(padre, entrada, "page.tsx")),
    )
  );
}

describe("Las pestañas de cada módulo", () => {
  it("cada pestaña tiene su página y su rótulo", () => {
    for (const [modulo, pestanas] of Object.entries(PESTANAS)) {
      for (const pestana of pestanas) {
        expect(tienePagina(pestana.ruta), `${modulo} · ${pestana.clave} sin página`).toBe(true);
        const texto = pestana.rotulo
          .split(".")
          .reduce<unknown>((nodo, parte) => (nodo as Record<string, unknown>)?.[parte], copy);
        expect(typeof texto, `${modulo} · ${pestana.clave} sin rótulo`).toBe("string");
      }
    }
  });

  it("la primera pestaña de cada módulo es su raíz", () => {
    for (const [modulo, pestanas] of Object.entries(PESTANAS)) {
      const raiz = MODULOS.find((candidato) => candidato.clave === modulo)?.ruta;
      expect(pestanas[0].ruta, modulo).toBe(raiz);
    }
  });

  it("gana la pestaña de ruta más larga, no la primera que encaja", () => {
    expect(pestanaActiva("/panel/presupuesto", PESTANAS.presupuesto)).toBe("categorias");
    expect(pestanaActiva("/panel/presupuesto/pagos", PESTANAS.presupuesto)).toBe("pagos");
    // La ficha de una invitación cuelga de la lista, no de «Sin contestar».
    expect(
      pestanaActiva(
        "/panel/invitados/00000000-0000-4000-8000-000000000000",
        PESTANAS.invitados,
      ),
    ).toBe("invitaciones");
    expect(pestanaActiva("/panel/invitados/pendientes", PESTANAS.invitados)).toBe(
      "sinContestar",
    );
  });

  it("una ruta de otro módulo no marca ninguna", () => {
    expect(pestanaActiva("/panel/mesas", PESTANAS.presupuesto)).toBeNull();
    // Ni un prefijo de texto que no es una subruta: «presupuestos» no es «presupuesto/».
    expect(pestanaActiva("/panel/presupuestos", PESTANAS.presupuesto)).toBeNull();
  });
});
