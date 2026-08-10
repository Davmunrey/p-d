import { readFileSync } from "node:fs";
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

  it("define el tema oscuro reasignando los mismos tokens", () => {
    expect(css).toContain('[data-tema="oscuro"]');
    expect(css).toContain("prefers-color-scheme: dark");
  });
});
