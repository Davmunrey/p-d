import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * NINGUNA CLAVE DE COPY SE QUEDA SIN PINTAR
 *
 * Una clave escrita y nunca usada no rompe nada, y ése es justo el problema:
 * `errores.noEncontrado` llevaba desde el principio en el fichero, con su frase
 * en castellano preparada, y la página 404 seguía saliendo en inglés porque
 * nadie la había pintado. Ninguna prueba lo cantó. Se descubrió leyendo.
 *
 * Detrás de una clave huérfana hay una de dos cosas, y las dos merecen saberse:
 *
 *   · Restos. Una tabla que se convirtió en tarjetas y dejó atrás sus cuatro
 *     cabeceras de columna. Pesan poco, pero cuando alguien busca cómo se dice
 *     algo encuentra dos candidatas y sólo una está enchufada.
 *   · Una pantalla a medias. El copy escrito, la interfaz sin hacer.
 *
 * CÓMO SE MIRA. La mayoría de las claves se escriben enteras —`t("rsvp.nombre")`—
 * pero unas cuantas familias se resuelven en tiempo de ejecución:
 * `` t(`panel.modulos.${clave}`) ``. Esos prefijos se sacan del propio código en
 * vez de mantener una lista a mano, para que una familia nueva no obligue a
 * tocar este test — y para que nadie la añada aquí para callarlo.
 */

const RAIZ = join(__dirname, "..", "..");
const COPY = JSON.parse(readFileSync(join(RAIZ, "content/copy.es.json"), "utf8")) as object;

/** Cada ruta de claves que llega hasta un texto. */
function* rutas(nodo: unknown, camino = ""): Generator<string> {
  if (nodo && typeof nodo === "object" && !Array.isArray(nodo)) {
    for (const [clave, hijo] of Object.entries(nodo)) {
      yield* rutas(hijo, camino ? `${camino}.${clave}` : clave);
    }
  } else if (!Array.isArray(nodo)) {
    yield camino;
  }
}

function ficheros(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const camino = join(directorio, entrada.name);
    if (entrada.isDirectory()) return ficheros(camino);
    return [".ts", ".tsx", ".mjs"].includes(extname(entrada.name)) ? [camino] : [];
  });
}

/*
  SÓLO CUENTA LO QUE PINTA LA WEB: `src/` y los guiones que la generan. Un test
  que afirma sobre un copy no lo enchufa a ninguna pantalla —`errores.generico`
  vivió meses así, citado por un E2E y pintado por nadie—, así que lo que
  aparezca sólo en `tests/` no da por viva ninguna clave.
*/
const FUENTE = ["src", "scripts"]
  .map((carpeta) => ficheros(join(RAIZ, carpeta)))
  .flat()
  .map((fichero) => readFileSync(fichero, "utf8"))
  .join("\n");

/** `` `panel.modulos.${ `` → `panel.modulos.`: las familias que se resuelven al vuelo. */
const PREFIJOS_AL_VUELO = [
  ...new Set([...FUENTE.matchAll(/`([a-zA-Z][a-zA-Z.]*\.)\$\{/g)].map((m) => m[1])),
];

/**
 * Un prefijo de PRIMER NIVEL —`cocina.`— no es una familia: es un bloque
 * entero, y darlo por usado eximía del barrido a sus setenta y nueve claves de
 * golpe (`cocina.pruebaMovimiento` estaba muerta y en verde). Para esos, la
 * hoja tiene que aparecer escrita en el código: `"grupoSuperficies"`.
 */
function cubiertaPorPrefijo(ruta: string): boolean {
  return PREFIJOS_AL_VUELO.some((prefijo) => {
    if (!ruta.startsWith(prefijo)) return false;
    const niveles = prefijo.split(".").filter(Boolean).length;
    if (niveles >= 2) return true;
    const hoja = ruta.slice(prefijo.length);
    return !hoja.includes(".") && FUENTE.includes(`"${hoja}"`);
  });
}

function usada(ruta: string): boolean {
  for (const comilla of ['"', "'", "`"]) {
    if (FUENTE.includes(`${comilla}${ruta}${comilla}`)) return true;
  }
  return cubiertaPorPrefijo(ruta);
}

describe("las claves de copy", () => {
  const todas = [...rutas(COPY)];

  it("hay claves que comprobar y familias que se resuelven al vuelo", () => {
    expect(todas.length).toBeGreaterThan(1000);
    expect(PREFIJOS_AL_VUELO.length).toBeGreaterThan(10);
  });

  it("todas se pintan en alguna parte", () => {
    expect(
      todas.filter((ruta) => !usada(ruta)),
      "o se enchufa a la pantalla que le falta, o se borra: guardada no sirve a nadie",
    ).toEqual([]);
  });

  it("detecta de verdad una clave huérfana", () => {
    /*
      Sin esto, el test de arriba pasaría igual con el barrido roto. La clave
      falsa se compone en trozos a propósito: escrita entera aparecería en este
      mismo fichero, que también se barre, y se daría por usada a sí misma.
    */
    const inventada = ["una", "clave", "que", "nadie", "escribe"].join(".");

    expect(usada(inventada)).toBe(false);
  });

  it("y una huérfana debajo de un prefijo de primer nivel", () => {
    // `cocina.` sale del código como prefijo al vuelo; una clave inventada
    // debajo tiene que seguir saliendo como huérfana.
    expect(PREFIJOS_AL_VUELO).toContain("cocina.");
    expect(usada(["cocina", "claveQueNadieEscribe"].join("."))).toBe(false);
  });
});
