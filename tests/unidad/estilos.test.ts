import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BODA-02 · Integridad del sistema de estilos
 *
 * Estos tests existen por un fallo real: `stylelint --fix` reescribió
 * `@import "tailwindcss"` como `@import url("tailwindcss")`, Tailwind v4 no
 * resuelve esa notación, y el proyecto compiló sin UNA SOLA utilidad. Todo
 * seguía "funcionando" —build en verde, tests en verde— pero la web salía sin
 * estilos.
 *
 * Un fallo silencioso que rompe toda la aplicación merece su propio guardián,
 * y en la causa raíz, no en el síntoma.
 */

const RAIZ = join(__dirname, "..", "..");

/**
 * Lee un fichero CSS quitando los comentarios: si no, un comentario que
 * mencione `@import url(...)` para advertir del problema dispararía la propia
 * comprobación que documenta.
 */
function leer(ruta: string) {
  return readFileSync(join(RAIZ, ruta), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("globals.css", () => {
  const css = leer("src/styles/globals.css");

  it("importa Tailwind con notación de cadena, nunca con url()", () => {
    expect(css).toContain('@import "tailwindcss"');
    expect(
      css,
      "Tailwind v4 no resuelve @import url(...): compilaría sin utilidades",
    ).not.toMatch(/@import\s+url\(/);
  });

  it("importa las tres capas de tokens", () => {
    for (const capa of ["primitives", "semantic", "motion"]) {
      expect(css).toContain(`@import "./tokens/${capa}.css"`);
    }
  });

  it("excluye del escaneo las carpetas que no son código nuestro", () => {
    // Sin esto, la documentación de terceros y las piezas del estudio de marca
    // meten utilidades que nadie usa en el CSS que descarga cada invitado.
    expect(css).toMatch(/@source not ".*\.claude"/);
    expect(css).toMatch(/@source not ".*\.agents"/);
    expect(css).toMatch(/@source not ".*Sistema completo de boda"/);
  });

  it("borra las escalas por defecto de Tailwind", () => {
    // Solo debe existir el vocabulario del sistema de marca: nadie puede
    // escribir bg-red-500 ni text-2xl.
    for (const familia of ["--color-*", "--font-*", "--text-*", "--radius-*", "--shadow-*"]) {
      expect(css).toContain(`${familia}: initial`);
    }
  });

  it("no reasigna ningún token a sí mismo", () => {
    // `--x: var(--x)` es recursivo: el navegador lo descarta y el token queda
    // sin valor. Pasó con los easings y con los breakpoints.
    const recursivos = [...css.matchAll(/(--[\w-]+):\s*var\((--[\w-]+)\)/g)].filter(
      ([, destino, origen]) => destino === origen,
    );

    expect(recursivos.map(([texto]) => texto)).toEqual([]);
  });
});

describe("capa de primitivos", () => {
  const css = leer("src/styles/tokens/primitives.css");

  it("define las escalas de la marca", () => {
    for (const escala of [
      "--color-marino-500",
      "--color-bronce-600",
      "--color-nieve-50",
      "--color-pizarra-900",
    ]) {
      expect(css).toContain(escala);
    }
  });

  it("no queda ni rastro de la paleta verde oliva", () => {
    // La marca tiene dos versiones entregadas y se monta la azul. Un primitivo
    // oliva superviviente sería un color que ya no está en ninguna pieza del
    // sistema, esperando a que alguien lo use sin saberlo.
    for (const escala of ["oliva", "crema", "hueso", "carbon"]) {
      expect(css, `Queda un primitivo de la paleta anterior: --color-${escala}-*`).not.toMatch(
        new RegExp(`--color-${escala}-`),
      );
    }
  });
});

describe("capa semántica", () => {
  const css = leer("src/styles/tokens/semantic.css");

  it("no contiene ningún valor literal: solo referencias a primitivos", () => {
    const literales = [...css.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)]
      .map(([, nombre, valor]) => ({ nombre, valor: valor.trim() }))
      .filter(({ valor }) => !valor.startsWith("var("));

    expect(
      literales.map((l) => `${l.nombre}: ${l.valor}`),
      "La capa semántica solo consume primitivos. Si falta un valor, créalo en primitives.css",
    ).toEqual([]);
  });

  /**
   * NO HAY TEMA OSCURO, Y ESTE TEST ES EL PORTERO.
   *
   * Lo hubo. Volver a añadirlo son dos líneas y una buena intención —«que siga
   * al sistema, que es lo moderno»—, y el resultado es que media lista de
   * invitados abre en negro una invitación clara. Aquí se corta: si alguien
   * escribe cualquiera de las dos reglas, este test lo dice por su nombre.
   */
  it("no queda ninguna regla que pinte la web en oscuro", () => {
    expect(css, "la web no sigue la preferencia del sistema").not.toContain(
      "prefers-color-scheme: dark",
    );
    expect(css, "no queda tema oscuro que forzar").not.toContain('[data-tema="oscuro"]');
  });

  /**
   * Y la contraparte: los bloques inversos SÍ existen y no son lo mismo. La
   * cuenta atrás, el RSVP y el pie van en marino porque los diseñó así el
   * estudio, no porque nadie lleve el móvil en oscuro.
   */
  it("los bloques inversos siguen reasignando los mismos tokens", () => {
    expect(css).toContain('[data-seccion="inversa"]');
  });
});

/**
 * BODA-08 · EL HUECO POR EL QUE SE COLABA EL HARDCODE
 *
 * El bloque `@theme inline` borra ocho familias de Tailwind con `*: initial`, y
 * por eso nadie puede escribir `bg-red-500` ni `text-2xl`. Pero las utilidades
 * de espaciado no salen de una familia: salen de UNA variable, `--spacing`,
 * que Tailwind trae puesta a `0.25rem`. Mientras estuvo, `p-4`, `h-11`, `w-64`
 * y `mt-8` compilaban tan ricamente y ningún lint decía nada.
 *
 * Es hardcode con otra cara, y se había colado en el propio sistema de diseño.
 *
 * ESTO SE COMPRUEBA AQUÍ Y NO EN UN E2E porque Tailwind sólo genera las clases
 * que encuentra en el código: una clase inyectada en el navegador mide cero
 * exista o no la utilidad, así que un test así pasaría igual con el hueco
 * abierto.
 */
describe("El vocabulario de espaciado está cerrado", () => {
  const css = leer("src/styles/globals.css");

  it("la escala numérica de Tailwind está borrada", () => {
    expect(css, "sin `--spacing: initial`, `p-4` y `h-11` vuelven a compilar").toMatch(
      /--spacing:\s*initial/,
    );
  });

  it("pero el cero se queda: `top-0` lo necesita", () => {
    // Borrar la escala entera apagaba `top-0` e `inset-0` y con ellos la barra
    // fija de navegación, sin que nada avisara.
    expect(css).toMatch(/--spacing-0:/);
  });

  it("ningún componente usa una medida numérica", () => {
    const NUMERICA =
      /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|w|h|size|min-w|min-h|space-x|space-y|inset|top|left|right|bottom)-[1-9][0-9]*(?:\.[0-9]+)?\b/;

    const infractores = ficherosDeCodigo()
      .map((ruta) => ({ ruta, texto: readFileSync(ruta, "utf8") }))
      .filter(({ texto }) => NUMERICA.test(texto))
      .map(({ ruta }) => ruta.replace(RAIZ, ""));

    expect(
      infractores,
      "una medida numérica es un valor suelto: dale nombre en primitives.css",
    ).toEqual([]);
  });
});

/** Todos los `.ts`/`.tsx` de `src`, recorriendo carpetas a mano. */
function ficherosDeCodigo(): string[] {
  const encontrados: string[] = [];

  const recorrer = (carpeta: string) => {
    for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
      const ruta = join(carpeta, entrada.name);
      if (entrada.isDirectory()) recorrer(ruta);
      else if (/\.tsx?$/.test(entrada.name)) encontrados.push(ruta);
    }
  };

  recorrer(join(RAIZ, "src"));
  return encontrados;
}
