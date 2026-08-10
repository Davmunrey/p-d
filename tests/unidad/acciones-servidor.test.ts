import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * UN MÓDULO `"use server"` SÓLO PUEDE EXPORTAR FUNCIONES ASÍNCRONAS
 *
 * Es una regla del framework, no una preferencia. Y no la vigila nadie: un
 * `export const` o un `export interface` en un fichero de acciones **compila
 * sin una queja**, pasa el typecheck, pasa el lint, y luego la pantalla que lo
 * importa revienta al abrirla con un «Algo no ha ido bien» que no dice por qué.
 *
 * Pasó de verdad, en `panel/invitados/importar/acciones.ts`, y lo cazó el
 * único trabajo de CI que abre esa pantalla con sesión — seis minutos después
 * de subirlo y sin más pista que un `<h1>` de error. Este test lo dice en
 * milisegundos y señalando la línea.
 *
 * Los tipos y las constantes que comparten una acción y su pantalla van a un
 * módulo aparte, como `importar/estado.ts`.
 */

const RAIZ = join(__dirname, "..", "..");

/** Todos los `.ts` y `.tsx` de `src/`, sin depender de ninguna librería. */
function fuentes(directorio: string): string[] {
  const encontradas: string[] = [];
  for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) encontradas.push(...fuentes(ruta));
    else if (/\.tsx?$/.test(entrada.name)) encontradas.push(ruta);
  }
  return encontradas;
}

/** Ficheros que declaran `"use server"` en su primera línea útil. */
function modulosDeServidor(): string[] {
  return fuentes(join(RAIZ, "src")).filter((ruta) =>
    /^\s*["']use server["']/.test(readFileSync(ruta, "utf8")),
  );
}

/**
 * Exportaciones que NO son una función asíncrona.
 *
 * `export type` y `export interface` cuentan igual: aunque desaparecen al
 * compilar, el fichero que los reexporta arrastra el módulo entero al cliente
 * y el error es el mismo. Se escriben en su sitio y no aquí.
 */
const PROHIBIDAS = /^\s*export\s+(const|let|var|class|interface|type|enum)\s/gm;

describe("Los módulos de acciones de servidor", () => {
  it("hay alguno que vigilar", () => {
    // Si esto baja a cero, el glob ha dejado de encontrarlos y el test se
    // estaría dando por bueno sin mirar nada.
    expect(modulosDeServidor().length).toBeGreaterThan(0);
  });

  it("sólo exportan funciones asíncronas", () => {
    const culpables: string[] = [];

    for (const ruta of modulosDeServidor()) {
      const contenido = readFileSync(ruta, "utf8");
      const relativa = ruta.slice(RAIZ.length + 1);

      for (const coincidencia of contenido.matchAll(PROHIBIDAS)) {
        const linea = contenido.slice(0, coincidencia.index).split("\n").length;
        culpables.push(`${relativa}:${linea} → ${coincidencia[0].trim()}`);
      }

      // Y las funciones exportadas, asíncronas: una función síncrona exportada
      // desde aquí falla igual, y con el mismo silencio.
      for (const coincidencia of contenido.matchAll(/^\s*export\s+function\s/gm)) {
        const linea = contenido.slice(0, coincidencia.index).split("\n").length;
        culpables.push(`${relativa}:${linea} → export function (tiene que ser async)`);
      }
    }

    expect(
      culpables,
      'un módulo "use server" sólo exporta funciones asíncronas: lleva tipos y ' +
        "constantes a un fichero aparte",
    ).toEqual([]);
  });
});
