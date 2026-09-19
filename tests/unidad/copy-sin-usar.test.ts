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

const FUENTE = ["src", "tests", "scripts"]
  .map((carpeta) => ficheros(join(RAIZ, carpeta)))
  .flat()
  .map((fichero) => readFileSync(fichero, "utf8"))
  .join("\n");

/** `` `panel.modulos.${ `` → `panel.modulos.`: las familias que se resuelven al vuelo. */
const PREFIJOS_AL_VUELO = [
  ...new Set([...FUENTE.matchAll(/`([a-zA-Z][a-zA-Z.]*\.)\$\{/g)].map((m) => m[1])),
];

function usada(ruta: string): boolean {
  for (const comilla of ['"', "'", "`"]) {
    if (FUENTE.includes(`${comilla}${ruta}${comilla}`)) return true;
  }
  // Los tests leen el JSON importado: `copy.panel.dia.titulo`.
  if (new RegExp(`\\bcopy\\.${ruta.replace(/\./g, "\\.")}\\b`).test(FUENTE)) return true;
  return PREFIJOS_AL_VUELO.some((prefijo) => ruta.startsWith(prefijo));
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
});
