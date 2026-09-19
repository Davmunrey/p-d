import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * NINGUNA CONSTANTE SE QUEDA SIN USAR
 *
 * `src/config/constants.ts` es donde la regla 1 manda todo lo que podría cambiar
 * sin que cambie la lógica. Eso lo convierte también en el sitio donde se queda
 * lo que dejó de usarse, porque borrar una constante no lo pide nadie: no
 * molesta, no rompe, y nada la señala.
 *
 * Y NO ES SÓLO PESO MUERTO. Ahí vivía `LONGITUD_TOKEN_INVITACION = 24`, con su
 * comentario —«Longitud del token de invitación»— sin usarse en ninguna parte
 * desde el primer commit. El token lo genera `generar_token_invitacion()` en
 * SQL: 24 BYTES aleatorios en base64, que son **32 caracteres**. Quien hubiera
 * escrito una validación contra esa constante habría rechazado todos los
 * enlaces buenos, y con el número puesto por escrito para respaldarle.
 *
 * Una constante muerta no es un hueco vacío: es una afirmación que ya no la
 * comprueba nadie.
 */

const RAIZ = join(__dirname, "..", "..");
const CONSTANTES = join(RAIZ, "src", "config", "constants.ts");

/** Todo el código del proyecto MENOS el propio fichero de constantes. */
function fuente(): string {
  const recorrer = (directorio: string): string[] =>
    readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
      const camino = join(directorio, entrada.name);
      if (entrada.isDirectory()) return recorrer(camino);
      return [".ts", ".tsx", ".mjs"].includes(extname(entrada.name)) ? [camino] : [];
    });

  /*
    `instrumentation.ts` e `instrumentation-client.ts` viven en la RAÍZ, no en
    `src/`: los carga Next por su nombre y su sitio. Dejarlos fuera del barrido
    daría por muertas `SENTRY_DSN` y `MUESTREO_TRAZAS`, que son justo las que
    apagan la observabilidad entera si se tocan.
  */
  const sueltos = readdirSync(RAIZ, { withFileTypes: true })
    .filter((entrada) => entrada.isFile() && /\.(ts|tsx|mjs)$/.test(entrada.name))
    .map((entrada) => join(RAIZ, entrada.name));

  return [...["src", "tests", "scripts"].flatMap((c) => recorrer(join(RAIZ, c))), ...sueltos]
    .filter((fichero) => fichero !== CONSTANTES)
    .map((fichero) => readFileSync(fichero, "utf8"))
    .join("\n");
}

describe("src/config/constants.ts", () => {
  const declaradas = [
    ...readFileSync(CONSTANTES, "utf8").matchAll(/^export const (\w+)/gm),
  ].map((encontrada) => encontrada[1]);
  const codigo = fuente();

  it("hay constantes que comprobar", () => {
    expect(declaradas.length).toBeGreaterThan(50);
  });

  it("todas se usan en alguna parte", () => {
    const muertas = declaradas.filter((nombre) => !new RegExp(`\\b${nombre}\\b`).test(codigo));

    expect(
      muertas,
      "una constante que no usa nadie es una afirmación que ya no comprueba nadie: bórrala",
    ).toEqual([]);
  });

  it("detecta de verdad una constante muerta", () => {
    // Compuesta en trozos: escrita entera, este mismo fichero la daría por usada.
    const inventada = ["CONSTANTE", "QUE", "NADIE", "ESCRIBE"].join("_");
    expect(new RegExp(`\\b${inventada}\\b`).test(codigo)).toBe(false);
  });
});
