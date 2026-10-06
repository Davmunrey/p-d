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
 * regla 1: al día siguiente la web es marino y la imagen que sale en WhatsApp
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

/**
 * Tokens semánticos que se necesitan fuera del CSS.
 *
 * `acento` entra porque el conector «y» de la tarjeta va en bronce, como en
 * todas las piezas de la entrega. Sin él se pintaba en marino y la tarjeta que
 * sale en WhatsApp perdía justo el color que distingue a esta versión.
 */
const NECESARIOS = ["fondo", "superficie", "tinta", "tinta-suave", "marca", "acento", "borde"];

/**
 * La escala de la imagen para compartir, en píxeles: Satori no entiende rem ni
 * variables. Se exporta como números, con el nombre del semántico sin `og-`.
 */
const ESCALA_OG = [
  "margen-vertical",
  "margen-lateral",
  "texto-etiqueta",
  "espaciado-etiqueta",
  "texto-nombres",
  "texto-conector",
  "solape-conector",
  "texto-pie",
  "hueco",
  "hueco-pie",
  "filete",
];

function sinComentarios(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** `--color-marino-700: #1f2b44;` → { "color-marino-700": "#1f2b44" } */
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

/**
 * LOS GRUPOS DE COLOR DE `/cocina`, LEÍDOS DEL CSS Y NO ESCRITOS A MANO.
 *
 * El catálogo llevaba su propia lista de colores y se quedó corto sin que nadie
 * lo viera: enseñaba 27 de los 47 de la capa semántica. Una página que dice «si
 * un valor no aparece aquí, no debería existir» no puede depender de que alguien
 * se acuerde de copiar un nombre.
 *
 * Así que los grupos salen de los rótulos de sección que `semantic.css` ya
 * lleva (`/* --- Superficies --- *\/`) y entra en cada uno todo token del `:root`
 * que apunte a un primitivo de color. El rótulo da el `id`; el nombre que se lee
 * vive en el copy (`cocina.gruposColor.<id>`), y si falta, el typecheck lo dice.
 */
const MARCA_GRUPO = "@@grupo:";

function idDeGrupo(rotulo) {
  return rotulo
    .split(/[(:]/)[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((palabra, i) => (i === 0 ? palabra : palabra[0].toUpperCase() + palabra.slice(1)))
    .join("");
}

function gruposDeColor(cssConComentarios) {
  const marcado = cssConComentarios.replace(
    /\/\*\s*---\s*([^*]+?)\s*-{3,}\s*\*\//g,
    (_, rotulo) => `${MARCA_GRUPO}${idDeGrupo(rotulo)};`,
  );
  const raiz = bloqueDe(sinComentarios(marcado), ":root");

  const grupos = [];
  for (const linea of raiz.split(";").map((trozo) => trozo.trim())) {
    if (linea.startsWith(MARCA_GRUPO)) {
      grupos.push({ id: linea.slice(MARCA_GRUPO.length), tokens: [] });
      continue;
    }
    const declaracion = linea.match(/^--([\w-]+)\s*:\s*var\(--color-[\w-]+\)$/);
    if (!declaracion) continue;
    const grupo = grupos.at(-1);
    if (!grupo) {
      throw new Error(`--${declaracion[1]} es un color sin rótulo de sección encima.`);
    }
    grupo.tokens.push(declaracion[1]);
  }
  return grupos.filter((grupo) => grupo.tokens.length > 0);
}

const primitivos = declaracionesDe(
  sinComentarios(readFileSync(join(RAIZ, "src/styles/tokens/primitives.css"), "utf8")),
);
const semanticoConComentarios = readFileSync(
  join(RAIZ, "src/styles/tokens/semantic.css"),
  "utf8",
);
const semanticoCss = sinComentarios(semanticoConComentarios);

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

const escalaOg = Object.fromEntries(
  ESCALA_OG.map((nombre) => {
    const literal = resolver(`og-${nombre}`, claro);
    const px = literal.match(/^(\d+(?:\.\d+)?)px$/);
    if (!px)
      throw new Error(`--og-${nombre} vale "${literal}": la imagen sólo entiende píxeles.`);
    const camello = nombre.replace(/-(\w)/g, (_, letra) => letra.toUpperCase());
    return [camello, Number(px[1])];
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

export const ESCALA_OG = ${JSON.stringify(escalaOg, null, 2)} as const;

/**
 * Los colores de la capa semántica, agrupados por los rótulos de sección de
 * \`semantic.css\`. Los enseña \`/cocina\`, uno por ficha.
 */
export const GRUPOS_COLOR = ${JSON.stringify(gruposDeColor(semanticoConComentarios), null, 2)} as const;
`;

writeFileSync(SALIDA, contenido, "utf8");
console.log(`Tokens generados en ${SALIDA.replace(RAIZ + "/", "")}`);
