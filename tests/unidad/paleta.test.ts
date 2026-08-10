import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Integridad de la paleta contra la entrega de marca
 *
 * El sistema de marca de Paloma y David se entregó en dos versiones, verde
 * oliva y azul marino, y cada una trae su tabla de tokens ya resuelta a hex
 * (`Sistema completo de boda/Sistema de marca azul.dc.html`). Se monta la azul.
 *
 * Estos tests recorren las dos capas —semántico → primitivo— y comparan el
 * literal final con esa tabla. No comprueban que los colores "queden bien":
 * comprueban que son EXACTAMENTE los entregados.
 *
 * Existe porque una paleta se degrada sin que salte ninguna alarma. Alguien
 * ajusta un borde "que se veía duro", otro aclara un gris, y al cabo de unas
 * semanas la web y la cartelería impresa ya no son la misma marca — con la
 * diferencia de que la cartelería no se puede volver a desplegar.
 */

const RAIZ = join(__dirname, "..", "..");

/** Tabla de la entrega, tema claro. Copiada de la pieza, no deducida. */
const CLARO: Record<string, string> = {
  fondo: "#f8f9fc",
  superficie: "#ffffff",
  "superficie-elevada": "#ffffff",
  "superficie-hundida": "#eef1f6",
  "superficie-tenue": "#e7ecf3",
  "superficie-inversa": "#0d1220",
  tinta: "#121722",
  "tinta-suave": "#434e63",
  "tinta-tenue": "#78839a",
  "tinta-inversa": "#f8f9fc",
  "tinta-marca": "#1f2b44",
  marca: "#3f4f70",
  "marca-hover": "#2c3a56",
  "marca-activo": "#16213a",
  "marca-tenue": "#e7ecf3",
  acento: "#8a6224",
  "acento-hover": "#a97634",
  borde: "#dfe4ec",
  "borde-fuerte": "#b7c0d0",
  "borde-marca": "#8b97ac",
  exito: "#1f7a4c",
  aviso: "#b8860b",
  error: "#d14545",
};

/** La misma tabla, tema oscuro. */
const OSCURO: Record<string, string> = {
  fondo: "#101623",
  superficie: "#151c2b",
  "superficie-elevada": "#1c2434",
  "superficie-hundida": "#0b1120",
  "superficie-tenue": "#16213a",
  "superficie-inversa": "#f8f9fc",
  tinta: "#eef2f8",
  "tinta-suave": "#c3cee1",
  "tinta-tenue": "#7e8aa0",
  "tinta-inversa": "#121722",
  "tinta-marca": "#9db0ce",
  marca: "#8fa0bc",
  "marca-hover": "#aec0da",
  "marca-activo": "#c3cee1",
  "marca-tenue": "#141e33",
  acento: "#e3be86",
  "acento-hover": "#f0d6ac",
  borde: "#16213a",
  "borde-fuerte": "#2c3a56",
  "borde-marca": "#3f4f70",
  exito: "#4fae7b",
  aviso: "#d9a425",
  error: "#e06a6a",
};

function leer(ruta: string) {
  return readFileSync(join(RAIZ, ruta), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

function declaracionesDe(bloque: string) {
  const mapa = new Map<string, string>();
  for (const [, nombre, valor] of bloque.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    mapa.set(nombre, valor.trim());
  }
  return mapa;
}

/** Cuerpo del primer bloque que abre con `selector`. */
function bloqueDe(css: string, selector: string) {
  const inicio = css.indexOf(selector);
  expect(inicio, `No se encontró el selector ${selector}`).toBeGreaterThan(-1);
  const abre = css.indexOf("{", inicio);
  return css.slice(abre + 1, css.indexOf("}", abre));
}

/** `#fff` y `#FFFFFF` son el mismo color: se comparan en la forma larga. */
function normalizar(hex: string) {
  const n = hex.trim().toLowerCase().replace("#", "");
  return `#${n.length === 3 ? [...n].map((c) => c + c).join("") : n}`;
}

const primitivos = declaracionesDe(leer("src/styles/tokens/primitives.css"));
const semanticoCss = leer("src/styles/tokens/semantic.css");
const claro = declaracionesDe(bloqueDe(semanticoCss, ":root"));
const oscuro = declaracionesDe(bloqueDe(semanticoCss, ':root[data-tema="oscuro"]'));

/** Resuelve un semántico hasta su literal, heredando de `:root` como el CSS. */
function resolver(nombre: string, propias: Map<string, string>) {
  const valor = propias.get(nombre) ?? claro.get(nombre);
  expect(valor, `Token semántico desconocido: --${nombre}`).toBeDefined();

  const referencia = valor!.match(/^var\(--([\w-]+)\)$/);
  expect(
    referencia,
    `--${nombre} vale "${valor}", que no referencia un primitivo`,
  ).not.toBeNull();

  const literal = primitivos.get(referencia![1]);
  expect(literal, `Primitivo desconocido: --${referencia![1]}`).toBeDefined();
  return normalizar(literal!);
}

describe("paleta azul marino", () => {
  it.each(Object.entries(CLARO))(
    "--%s resuelve al valor entregado en tema claro",
    (token, esperado) => {
      expect(resolver(token, claro)).toBe(esperado);
    },
  );

  it.each(Object.entries(OSCURO))(
    "--%s resuelve al valor entregado en tema oscuro",
    (token, esperado) => {
      expect(resolver(token, oscuro)).toBe(esperado);
    },
  );

  it("el acento es cálido: es lo que distingue a esta versión de la marca", () => {
    // Sobre tanto azul, un acento frío desaparece. Si alguien reasigna el
    // acento a un tono de la escala marino, el sistema pierde su único
    // contraste de temperatura y nadie lo nota mirando un swatch aislado.
    const temas: [string, Map<string, string>][] = [
      ["claro", claro],
      ["oscuro", oscuro],
    ];

    for (const [tema, propias] of temas) {
      const hex = resolver("acento", propias).slice(1);
      const [r, , b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(r, `El acento del tema ${tema} no es cálido`).toBeGreaterThan(b);
    }
  });

  it("la acción y el acento son colores distintos", () => {
    // El fallo que arrastraba el sistema: un solo token hacía de relleno de
    // botón y de acento, así que el acento de la entrega no existía en la web.
    for (const propias of [claro, oscuro]) {
      expect(resolver("accion", propias)).not.toBe(resolver("acento", propias));
    }
  });
});

/**
 * Contraste. La entrega da los colores; que se lean es responsabilidad de quien
 * los monta. Se comprueban los pares que de verdad se pintan juntos, en los
 * cuatro fondos del sistema: página clara, página oscura, bloque inverso y pie.
 */
describe("contraste de la paleta", () => {
  const inversa = declaracionesDe(bloqueDe(semanticoCss, '[data-seccion="inversa"]'));
  const pie = declaracionesDe(bloqueDe(semanticoCss, '[data-seccion="pie"]'));

  function luminancia(hex: string) {
    const canales = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lineal = canales.map((v) =>
      v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * lineal[0] + 0.7152 * lineal[1] + 0.0722 * lineal[2];
  }

  function contraste(a: string, b: string) {
    const [claroL, oscuroL] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return (claroL + 0.05) / (oscuroL + 0.05);
  }

  const FONDOS: [string, Map<string, string>][] = [
    ["tema claro", claro],
    ["tema oscuro", oscuro],
    ["bloque inverso", inversa],
    ["pie", pie],
  ];

  for (const [nombre, propias] of FONDOS) {
    it(`en ${nombre} el texto cumple AA sobre su fondo`, () => {
      const fondo = resolver("fondo", propias);
      // 4.5:1 es el umbral AA para texto normal.
      expect(contraste(resolver("tinta", propias), fondo)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(resolver("tinta-suave", propias), fondo)).toBeGreaterThanOrEqual(4.5);
    });

    it(`en ${nombre} el botón primario se ve y se lee`, () => {
      const relleno = resolver("accion", propias);
      // 3:1 para el relleno contra la página (elemento de interfaz), 4.5:1
      // para el rótulo contra el relleno (texto).
      expect(contraste(relleno, resolver("fondo", propias))).toBeGreaterThanOrEqual(3);
      expect(
        contraste(resolver("tinta-sobre-accion", propias), relleno),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it(`en ${nombre} el acento y el aro de foco se despegan del fondo`, () => {
      const fondo = resolver("fondo", propias);
      // El acento solo se usa en tamaños grandes (cita, conector, cifras) y el
      // aro de foco es un elemento de interfaz: 3:1 en ambos casos.
      expect(contraste(resolver("acento", propias), fondo)).toBeGreaterThanOrEqual(3);
      expect(contraste(resolver("foco", propias), fondo)).toBeGreaterThanOrEqual(3);
    });
  }
});
