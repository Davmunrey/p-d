#!/usr/bin/env node
/**
 * GENERA LOS TOKENS PARA CONTEXTOS SIN CSS
 *
 * Hay dos sitios donde la marca tiene que pintarse y no existe una hoja de
 * estilos: las imágenes de Open Graph, que se dibujan en el servidor, y los
 * correos, cuyos clientes no entienden `var()`. En los dos hacen falta los
 * valores literales.
 *
 * La tentación es escribirlos a mano y ya. Eso es exactamente lo que prohíbe la
 * regla 1: al día siguiente la web es oliva y la imagen que sale en WhatsApp
 * sigue siendo del color de antes, sin que nadie se entere.
 *
 * Así que se leen del propio CSS y se resuelven las dos capas —semántico →
 * primitivo— hasta el literal. El fichero resultante se versiona, y
 * `tests/unidad/tokens-generados.test.ts` comprueba que sigue al día: si
 * alguien cambia un color y no regenera, el CI se pone rojo.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = join(RAIZ, "src", "config", "tokens.generado.ts");

/** Qué paletas se exportan y de qué selector del CSS sale cada una. */
const PALETAS = {
  claro: ":root",
  inversa: '[data-seccion="inversa"]',
};

/** Tokens semánticos que se necesitan fuera del CSS. */
const NECESARIOS = ["fondo", "superficie", "tinta", "tinta-suave", "marca", "borde"];

function sinComentarios(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** `--color-oliva-700: #3c4233;` → { "color-oliva-700": "#3c4233" } */
function declaracionesDe(bloque) {
  const mapa = new Map();
  for (const [, nombre, valor] of bloque.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    mapa.set(nombre, valor.trim());
  }
  return mapa;
}

/** Extrae el cuerpo del primer bloque que abre con `selector`. */
function bloqueDe(css, selector) {
  const inicio = css.indexOf(selector);
  if (inicio === -1) throw new Error(`No se encontró el selector ${selector}`);
  const abre = css.indexOf("{", inicio);
  const cierra = css.indexOf("}", abre);
  return css.slice(abre + 1, cierra);
}

const primitivos = declaracionesDe(
  sinComentarios(readFileSync(join(RAIZ, "src/styles/tokens/primitives.css"), "utf8")),
);
const semanticoCss = sinComentarios(
  readFileSync(join(RAIZ, "src/styles/tokens/semantic.css"), "utf8"),
);

const claro = declaracionesDe(bloqueDe(semanticoCss, ":root"));

function resolver(nombre, propias) {
  // Una paleta que no redefine un token hereda el de `:root`, igual que en CSS.
  const valor = propias.get(nombre) ?? claro.get(nombre);
  if (!valor) throw new Error(`Token semántico desconocido: --${nombre}`);

  const referencia = valor.match(/^var\(--([\w-]+)\)$/);
  if (!referencia) {
    throw new Error(
      `--${nombre} vale "${valor}", que no es una referencia a un primitivo. ` +
        "La capa semántica no admite literales: falta un primitivo.",
    );
  }

  const literal = primitivos.get(referencia[1]);
  if (!literal) throw new Error(`Primitivo desconocido: --${referencia[1]}`);
  return literal;
}

const paletas = Object.fromEntries(
  Object.entries(PALETAS).map(([clave, selector]) => {
    const propias =
      clave === "claro" ? claro : declaracionesDe(bloqueDe(semanticoCss, selector));
    return [clave, Object.fromEntries(NECESARIOS.map((t) => [t, resolver(t, propias)]))];
  }),
);

const contenido = `/**
 * FICHERO GENERADO — no se edita a mano.
 *
 * Lo produce \`scripts/generar-tokens.mjs\` leyendo \`src/styles/tokens/\`, y se
 * regenera solo en cada build. Existe para los sitios donde la marca se pinta
 * sin hoja de estilos: las imágenes de Open Graph y, más adelante, los correos.
 *
 * Para cambiar un color, se cambia el token en el CSS y se regenera con
 * \`npm run tokens\`. Tocar este fichero no sirve de nada: el siguiente build lo
 * sobrescribe.
 */

export const PALETAS = ${JSON.stringify(paletas, null, 2)} as const;

export type Paleta = keyof typeof PALETAS;
`;

writeFileSync(SALIDA, contenido, "utf8");
console.log(`Tokens generados en ${SALIDA.replace(RAIZ + "/", "")}`);
