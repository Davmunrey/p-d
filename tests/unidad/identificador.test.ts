import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { esIdentificador } from "../../src/lib/identificador";

/**
 * La forma de un `uuid`, antes de mandárselo a la base.
 *
 * Y el guardián de que se use: cada lectura por id de ruta que llega a
 * PostgREST tiene que pasar por aquí, porque la que no lo hacía convertía una
 * URL mal escrita en una pantalla de avería en vez de en un 404.
 */
describe("esIdentificador", () => {
  it("acepta un uuid, en minúsculas o mayúsculas", () => {
    expect(esIdentificador("8f3c1a2e-4b5d-4c6e-9f10-1a2b3c4d5e6f")).toBe(true);
    expect(esIdentificador("8F3C1A2E-4B5D-4C6E-9F10-1A2B3C4D5E6F")).toBe(true);
  });

  it("rechaza lo que alguien escribe en una URL", () => {
    expect(esIdentificador("familia-perez")).toBe(false);
    expect(esIdentificador("constructor")).toBe(false);
    expect(esIdentificador("")).toBe(false);
    expect(esIdentificador("8f3c1a2e-4b5d-4c6e-9f10-1a2b3c4d5e6f ")).toBe(false);
    expect(esIdentificador("8f3c1a2e4b5d4c6e9f101a2b3c4d5e6f")).toBe(false);
  });

  it("hay una sola definición, y las lecturas por id de ruta la usan", () => {
    const ficheros = [
      "src/lib/bbdd/proveedores.ts",
      "src/lib/bbdd/invitados.ts",
      "src/app/panel/contenido/[lista]/acciones.ts",
    ];
    for (const fichero of ficheros) {
      const fuente = readFileSync(fichero, "utf8");
      expect(fuente, `${fichero} importa esIdentificador`).toContain(
        'from "@/lib/identificador"',
      );
      expect(fuente, `${fichero} no redefine la expresión`).not.toMatch(
        /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}/,
      );
    }

    // Y la lectura que se quedó sin guarda la lleva: `obtenerGrupo` devuelve
    // null ante un id sin forma, en vez de mandarlo a la base.
    const invitados = readFileSync("src/lib/bbdd/invitados.ts", "utf8");
    const obtenerGrupo = invitados.split("export async function obtenerGrupo(")[1] ?? "";
    expect(obtenerGrupo.split("\n").slice(0, 12).join("\n")).toMatch(
      /if \(!esIdentificador\(id\)\) return null;/,
    );
  });
});
