import { join } from "node:path";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * LAS REGLAS DE «CERO HARDCODE» SE PRUEBAN EJECUTÁNDOLAS
 *
 * La regla 1 del proyecto no la sostiene la revisión humana: la sostiene
 * `no-restricted-syntax` en `eslint.config.mjs`. Y esa configuración tiene una
 * trampa que no avisa — en la configuración plana, **`no-restricted-syntax` no
 * se suma entre bloques: se sustituye**. Un segundo bloque que la declare para
 * los `.tsx` apaga entera la del bloque anterior, sin error, sin aviso, y
 * dejando el lint en verde mientras deja de mirar lo que más importa.
 *
 * Pasó. Al cerrar el agujero de los atributos con texto se añadió un bloque
 * nuevo, y durante unos minutos un `bg-[#ff0000]` en un componente pasaba sin
 * una queja. Leyendo el fichero no se ve; ejecutándolo, sí.
 *
 * Así que este guardián no lee la configuración, la USA: pasa trozos de código
 * por ESLint de verdad y comprueba qué salta. Cuesta unos dos segundos, y es lo
 * que vale saber que la regla sigue viva.
 */

const RAIZ = join(__dirname, "..", "..");
const COMPONENTE = join(RAIZ, "src/components/ui/__prueba-de-lint.tsx");

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: RAIZ, overrideConfigFile: join(RAIZ, "eslint.config.mjs") });
});

/** Los mensajes de `no-restricted-syntax` que deja un trozo de código. */
async function quejas(codigo: string, fichero = COMPONENTE): Promise<string[]> {
  const [resultado] = await eslint.lintText(codigo, { filePath: fichero });
  return resultado.messages
    .filter((mensaje) => mensaje.ruleId === "no-restricted-syntax")
    .map((mensaje) => mensaje.message);
}

const componente = (jsx: string) => `export function Prueba() {\n  return ${jsx};\n}\n`;

describe("las cuatro reglas de cero hardcode, sobre un componente", () => {
  it("cazan el valor arbitrario de Tailwind y el color literal, y las dos a la vez", async () => {
    const mensajes = await quejas(componente('<div className="bg-[#ff0000]" />'));

    expect(mensajes.some((m) => m.includes("Valor arbitrario"))).toBe(true);
    expect(mensajes.some((m) => m.includes("Color literal"))).toBe(true);
  });

  it("cazan la prosa metida en un atributo", async () => {
    const mensajes = await quejas(componente('<div title="una frase entera" />'));
    expect(mensajes.some((m) => m.includes("Texto visible en un atributo"))).toBe(true);
  });

  it("LAS TRES SALTAN EN EL MISMO FICHERO: ninguna tapa a la otra", async () => {
    // Esta es la prueba del bloque que se sustituye. Si alguien vuelve a
    // declarar `no-restricted-syntax` en un segundo bloque que alcance a los
    // `.tsx`, aquí se queda una sola queja de las tres.
    const mensajes = await quejas(
      componente('<div className="bg-[#ff0000] text-[14px]" title="una frase entera" />'),
    );

    expect(mensajes.some((m) => m.includes("Valor arbitrario"))).toBe(true);
    expect(mensajes.some((m) => m.includes("Color literal"))).toBe(true);
    expect(mensajes.some((m) => m.includes("Texto visible en un atributo"))).toBe(true);
  });
});

describe("lo que NO tiene que saltar", () => {
  it("un atributo sin prosa se deja en paz: `alt` vacío, un valor de una palabra", async () => {
    const mensajes = await quejas(componente('<img src="/a.png" alt="" title="perfil" />'));
    expect(mensajes).toEqual([]);
  });

  it("un token semántico no es un valor arbitrario", async () => {
    const mensajes = await quejas(
      componente('<div className="bg-superficie text-titulo-1" />'),
    );
    expect(mensajes).toEqual([]);
  });

  it("las variantes de estado llevan corchetes y no son valores de diseño", async () => {
    const mensajes = await quejas(
      componente('<div className="data-[activo=true]:bg-superficie has-[input]:mt-pila" />'),
    );
    expect(mensajes).toEqual([]);
  });
});

describe("el alcance de las reglas", () => {
  it("el color literal también se caza fuera del JSX", async () => {
    const mensajes = await quejas(
      'export const MAL = "#abcdef";\n',
      join(RAIZ, "src/lib/__prueba-de-lint.ts"),
    );
    expect(mensajes.some((m) => m.includes("Color literal"))).toBe(true);
  });

  it("el fichero de tokens generados sigue exento, que para eso se generó", async () => {
    const mensajes = await quejas(
      'export const COLOR = "#abcdef";\n',
      join(RAIZ, "src/config/tokens.generado.ts"),
    );
    expect(mensajes).toEqual([]);
  });
});
